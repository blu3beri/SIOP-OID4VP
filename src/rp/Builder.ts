import { EventEmitter } from 'events';

import { Config, getUniResolver, UniResolver } from '@sphereon/did-uni-client';
import { IPresentationDefinition } from '@sphereon/pex';
import { VerifyCallback } from '@sphereon/wellknown-dids-client';
import { Signer } from 'did-jwt';
import { Resolvable, Resolver } from 'did-resolver';

import { PropertyTarget, PropertyTargets } from '../authorization-request';
import { PresentationVerificationCallback } from '../authorization-response';
import { getMethodFromDid } from '../did';
import {
  AuthorizationRequestPayload,
  CheckLinkedDomain,
  ClientMetadataOpts,
  EcdsaSignature,
  ExternalSignature,
  InternalSignature,
  NoSignature,
  ObjectBy,
  PassBy,
  RequestObjectPayload,
  ResponseIss,
  ResponseMode,
  ResponseType,
  RevocationVerification,
  RevocationVerificationCallback,
  SigningAlgo,
  SubjectSyntaxTypesSupportedValues,
  SuppliedSignature,
  SupportedVersion,
} from '../types';

import { assignIfAuth, assignIfRequestObject, isTarget, isTargetOrNoTargets } from './Opts';
import { RP } from './RP';
import { IRPSessionManager } from './types';

export default class Builder {
  resolvers: Map<string, Resolvable> = new Map<string, Resolvable>();
  customResolver?: Resolvable;
  requestObjectBy: ObjectBy;
  signature: InternalSignature | ExternalSignature | SuppliedSignature | NoSignature;
  checkLinkedDomain?: CheckLinkedDomain;
  wellknownDIDVerifyCallback?: VerifyCallback;
  revocationVerification?: RevocationVerification;
  revocationVerificationCallback?: RevocationVerificationCallback;
  presentationVerificationCallback?: PresentationVerificationCallback;
  supportedVersions: SupportedVersion[];
  eventEmitter?: EventEmitter;
  sessionManager?: IRPSessionManager;
  private _authorizationRequestPayload: Partial<AuthorizationRequestPayload> = {};
  private _requestObjectPayload: Partial<RequestObjectPayload> = {};

  clientMetadata?: ClientMetadataOpts = undefined;
  clientId: string;

  private constructor(supportedRequestVersion?: SupportedVersion) {
    if (supportedRequestVersion) {
      this.addSupportedVersion(supportedRequestVersion);
    }
  }

  withScope(scope: string, targets?: PropertyTargets): Builder {
    this._authorizationRequestPayload.scope = assignIfAuth({ propertyValue: scope, targets }, false);
    this._requestObjectPayload.scope = assignIfRequestObject({ propertyValue: scope, targets }, true);
    return this;
  }

  withResponseType(responseType: ResponseType | ResponseType[] | string, targets?: PropertyTargets): Builder {
    const propertyValue = Array.isArray(responseType) ? responseType.join(' ').trim() : responseType;
    this._authorizationRequestPayload.response_type = assignIfAuth({ propertyValue, targets }, false);
    this._requestObjectPayload.response_type = assignIfRequestObject({ propertyValue, targets }, true);
    return this;
  }

  withClientId(clientId: string, targets?: PropertyTargets): Builder {
    this._authorizationRequestPayload.client_id = assignIfAuth({ propertyValue: clientId, targets }, false);
    this._requestObjectPayload.client_id = assignIfRequestObject({ propertyValue: clientId, targets }, true);
    this.clientId = clientId;
    return this;
  }

  withIssuer(issuer: ResponseIss, targets?: PropertyTargets): Builder {
    this._authorizationRequestPayload.iss = assignIfAuth({ propertyValue: issuer, targets }, false);
    this._requestObjectPayload.iss = assignIfRequestObject({ propertyValue: issuer, targets }, true);
    return this;
  }

  withPresentationVerification(presentationVerificationCallback: PresentationVerificationCallback): Builder {
    this.presentationVerificationCallback = presentationVerificationCallback;
    return this;
  }

  withRevocationVerification(mode: RevocationVerification): Builder {
    this.revocationVerification = mode;
    return this;
  }

  withRevocationVerificationCallback(callback: RevocationVerificationCallback): Builder {
    this.revocationVerificationCallback = callback;
    return this;
  }

  withCustomResolver(resolver: Resolvable): Builder {
    this.customResolver = resolver;
    return this;
  }

  addResolver(didMethod: string, resolver: Resolvable): Builder {
    const qualifiedDidMethod = didMethod.startsWith('did:') ? getMethodFromDid(didMethod) : didMethod;
    this.resolvers.set(qualifiedDidMethod, resolver);
    return this;
  }

  withAuthorizationEndpoint(authorizationEndpoint: string, targets?: PropertyTargets): Builder {
    this._authorizationRequestPayload.authorization_endpoint = assignIfAuth(
      {
        propertyValue: authorizationEndpoint,
        targets,
      },
      false
    );
    this._requestObjectPayload.authorization_endpoint = assignIfRequestObject(
      {
        propertyValue: authorizationEndpoint,
        targets,
      },
      true
    );
    return this;
  }

  withCheckLinkedDomain(mode: CheckLinkedDomain): Builder {
    this.checkLinkedDomain = mode;
    return this;
  }

  addDidMethod(didMethod: string, opts?: { resolveUrl?: string; baseUrl?: string }): Builder {
    const method = didMethod.startsWith('did:') ? getMethodFromDid(didMethod) : didMethod;
    if (method === SubjectSyntaxTypesSupportedValues.DID.valueOf()) {
      opts ? this.addResolver('', new UniResolver({ ...opts } as Config)) : this.addResolver('', null);
    }
    opts ? this.addResolver(method, new Resolver(getUniResolver(method, { ...opts }))) : this.addResolver(method, null);
    return this;
  }

  withRedirectUri(redirectUri: string, targets?: PropertyTargets): Builder {
    this._authorizationRequestPayload.redirect_uri = assignIfAuth({ propertyValue: redirectUri, targets }, false);
    this._requestObjectPayload.redirect_uri = assignIfRequestObject({ propertyValue: redirectUri, targets }, true);
    return this;
  }

  withRequestByReference(referenceUri: string): Builder {
    return this.withRequestBy(PassBy.REFERENCE, referenceUri /*, PropertyTarget.AUTHORIZATION_REQUEST*/);
  }
  withRequestByValue(): Builder {
    return this.withRequestBy(PassBy.VALUE, undefined /*, PropertyTarget.AUTHORIZATION_REQUEST*/);
  }

  withRequestBy(passBy: PassBy, referenceUri?: string /*, targets?: PropertyTargets*/): Builder {
    if (passBy === PassBy.REFERENCE && !referenceUri) {
      throw Error('Cannot use pass by reference without a reference URI');
    }
    this.requestObjectBy = {
      passBy,
      reference_uri: referenceUri,
      targets: PropertyTarget.AUTHORIZATION_REQUEST,
    };
    return this;
  }

  withResponseMode(responseMode: ResponseMode, targets?: PropertyTargets): Builder {
    this._authorizationRequestPayload.response_mode = assignIfAuth({ propertyValue: responseMode, targets }, false);
    this._requestObjectPayload.response_mode = assignIfRequestObject({ propertyValue: responseMode, targets }, true);
    return this;
  }

  withClientMetadata(clientMetadata: ClientMetadataOpts, targets?: PropertyTargets): Builder {
    clientMetadata.targets = targets;
    if (this.getSupportedRequestVersion() < SupportedVersion.SIOPv2_D11) {
      this._authorizationRequestPayload.registration = assignIfAuth(
        {
          propertyValue: clientMetadata,
          targets,
        },
        false
      );
      this._requestObjectPayload.registration = assignIfRequestObject(
        {
          propertyValue: clientMetadata,
          targets,
        },
        true
      );
    } else {
      this._authorizationRequestPayload.client_metadata = assignIfAuth(
        {
          propertyValue: clientMetadata,
          targets,
        },
        false
      );
      this._requestObjectPayload.client_metadata = assignIfRequestObject(
        {
          propertyValue: clientMetadata,
          targets,
        },
        true
      );
    }
    this.clientMetadata = clientMetadata;
    //fixme: Add URL
    return this;
  }

  // Only internal and supplied signatures supported for now
  withSignature(signature: InternalSignature | SuppliedSignature): Builder {
    this.signature = signature;
    return this;
  }

  withInternalSignature(hexPrivateKey: string, did: string, kid: string, alg: SigningAlgo, customJwtSigner?: Signer): Builder {
    this.withSignature({ hexPrivateKey, did, kid, alg, customJwtSigner });
    return this;
  }

  withSuppliedSignature(
    signature: (data: string | Uint8Array) => Promise<EcdsaSignature | string>,
    did: string,
    kid: string,
    alg: SigningAlgo
  ): Builder {
    this.withSignature({ signature, did, kid, alg });
    return this;
  }

  withPresentationDefinition(definitionOpts: { definition: IPresentationDefinition; definitionUri?: string }, targets?: PropertyTargets): Builder {
    const { definition, definitionUri } = definitionOpts;
    const definitionProperties = {
      presentation_definition: definition,
      presentation_definition_uri: definitionUri,
    };
    if (this.getSupportedRequestVersion() < SupportedVersion.SIOPv2_D11) {
      const vp_token = { ...definitionProperties };
      if (isTarget(PropertyTarget.AUTHORIZATION_REQUEST, targets)) {
        this._authorizationRequestPayload.claims = {
          ...(this._authorizationRequestPayload.claims ? this._authorizationRequestPayload.claims : {}),
          vp_token: vp_token,
        };
      }
      if (isTargetOrNoTargets(PropertyTarget.REQUEST_OBJECT, targets)) {
        this._requestObjectPayload.claims = {
          ...(this._requestObjectPayload.claims ? this._requestObjectPayload.claims : {}),
          vp_token: vp_token,
        };
      }
    } else {
      this._authorizationRequestPayload.presentation_definition = assignIfAuth(
        {
          propertyValue: definition,
          targets,
        },
        false
      );
      this._authorizationRequestPayload.presentation_definition_uri = assignIfAuth(
        {
          propertyValue: definitionUri,
          targets,
        },
        true
      );
      this._requestObjectPayload.presentation_definition = assignIfRequestObject(
        {
          propertyValue: definition,
          targets,
        },
        true
      );
      this._requestObjectPayload.presentation_definition_uri = assignIfRequestObject(
        {
          propertyValue: definitionUri,
          targets,
        },
        true
      );
    }
    return this;
  }

  withWellknownDIDVerifyCallback(wellknownDIDVerifyCallback: VerifyCallback): Builder {
    this.wellknownDIDVerifyCallback = wellknownDIDVerifyCallback;
    return this;
  }

  private initSupportedVersions() {
    if (!this.supportedVersions) {
      this.supportedVersions = [];
    }
  }

  addSupportedVersion(supportedVersion: SupportedVersion): Builder {
    this.initSupportedVersions();
    if (!this.supportedVersions.includes(supportedVersion)) {
      this.supportedVersions.push(supportedVersion);
    }
    return this;
  }

  withSupportedVersions(supportedVersion: SupportedVersion[] | SupportedVersion): Builder {
    const versions = Array.isArray(supportedVersion) ? supportedVersion : [supportedVersion];
    for (const version of versions) {
      this.addSupportedVersion(version);
    }
    return this;
  }

  withEventEmitter(eventEmitter?: EventEmitter): Builder {
    this.eventEmitter = eventEmitter ?? new EventEmitter();
    return this;
  }

  withSessionManager(sessionManager: IRPSessionManager): Builder {
    this.sessionManager = sessionManager;
    return this;
  }

  public getSupportedRequestVersion(requireVersion?: boolean): SupportedVersion | undefined {
    if (!this.supportedVersions || this.supportedVersions.length === 0) {
      if (requireVersion !== false) {
        throw Error('No supported version supplied/available');
      }
      return undefined;
    }
    return this.supportedVersions[0];
  }

  public static newInstance(supportedVersion?: SupportedVersion) {
    return new Builder(supportedVersion);
  }

  build(): RP {
    if (this.sessionManager && !this.eventEmitter) {
      throw Error('Please enable the event emitter on the RP when using a replay registry');
    }

    // We do not want others to directly use the RP class
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return new RP({ builder: this });
  }

  get authorizationRequestPayload(): Partial<AuthorizationRequestPayload> {
    return this._authorizationRequestPayload;
  }

  get requestObjectPayload(): Partial<RequestObjectPayload> {
    return this._requestObjectPayload;
  }

  /* public mergedPayload(): Partial<AuthorizationRequestPayload> {
    return { ...this.authorizationRequestPayload, ...this.requestObjectPayload };
  }*/
}