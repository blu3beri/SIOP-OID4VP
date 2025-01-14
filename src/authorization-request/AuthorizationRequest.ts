import { JWTVerifyOptions } from 'did-jwt';

import { PresentationDefinitionWithLocation } from '../authorization-response';
import { PresentationExchange } from '../authorization-response/PresentationExchange';
import { getAudience, getResolver, parseJWT, verifyDidJWT } from '../did';
import { fetchByReferenceOrUseByValue, removeNullUndefined } from '../helpers';
import { authorizationRequestVersionDiscovery } from '../helpers/SIOPSpecVersion';
import { RequestObject } from '../request-object';
import {
  AuthorizationRequestPayload,
  PassBy,
  RequestObjectJwt,
  RequestObjectPayload,
  RequestStateInfo,
  RPRegistrationMetadataPayload,
  Schema,
  SIOPErrors,
  SupportedVersion,
  VerifiedAuthorizationRequest,
  VerifiedJWT,
} from '../types';

import { assertValidAuthorizationRequestOpts, assertValidVerifyAuthorizationRequestOpts } from './Opts';
import { assertValidRPRegistrationMedataPayload, checkWellknownDIDFromRequest, createAuthorizationRequestPayload } from './Payload';
import { URI } from './URI';
import { CreateAuthorizationRequestOpts, VerifyAuthorizationRequestOpts } from './types';

export class AuthorizationRequest {
  private readonly _requestObject: RequestObject;
  private readonly _payload: AuthorizationRequestPayload;
  private readonly _options: CreateAuthorizationRequestOpts;
  private _uri: URI;

  private constructor(payload: AuthorizationRequestPayload, requestObject?: RequestObject, opts?: CreateAuthorizationRequestOpts, uri?: URI) {
    this._options = opts;
    this._payload = removeNullUndefined(payload);
    this._requestObject = requestObject;
    this._uri = uri;
  }

  public static async fromUriOrJwt(jwtOrUri: string | URI): Promise<AuthorizationRequest> {
    if (!jwtOrUri) {
      throw Error(SIOPErrors.NO_REQUEST);
    }
    return typeof jwtOrUri === 'string' && jwtOrUri.startsWith('ey')
      ? await AuthorizationRequest.fromJwt(jwtOrUri)
      : await AuthorizationRequest.fromURI(jwtOrUri);
  }

  public static async fromPayload(payload: AuthorizationRequestPayload): Promise<AuthorizationRequest> {
    if (!payload) {
      throw Error(SIOPErrors.NO_REQUEST);
    }
    const requestObject = await RequestObject.fromAuthorizationRequestPayload(payload);
    return new AuthorizationRequest(payload, requestObject);
  }

  public static async fromOpts(opts: CreateAuthorizationRequestOpts, requestObject?: RequestObject): Promise<AuthorizationRequest> {
    if (!opts || !opts.requestObject) {
      throw Error(SIOPErrors.BAD_PARAMS);
    }
    assertValidAuthorizationRequestOpts(opts);

    const requestObjectArg =
      opts.requestObject.passBy !== PassBy.NONE ? (requestObject ? requestObject : await RequestObject.fromOpts(opts)) : undefined;
    const requestPayload = opts?.payload ? await createAuthorizationRequestPayload(opts, requestObjectArg) : undefined;
    return new AuthorizationRequest(requestPayload, requestObjectArg, opts);
  }

  get payload(): AuthorizationRequestPayload {
    return this._payload;
  }

  get requestObject(): RequestObject | undefined {
    return this._requestObject;
  }

  get options(): CreateAuthorizationRequestOpts | undefined {
    return this._options;
  }

  public hasRequestObject(): boolean {
    return this.requestObject !== undefined;
  }

  public async getSupportedVersion() {
    if (this.options?.version) {
      return this.options.version;
    } else if (this._uri?.encodedUri?.startsWith(Schema.OPENID_VC) || this._uri?.scheme?.startsWith(Schema.OPENID_VC)) {
      return SupportedVersion.JWT_VC_PRESENTATION_PROFILE_v1;
    }

    return (await this.getSupportedVersionsFromPayload())[0];
  }

  public async getSupportedVersionsFromPayload(): Promise<SupportedVersion[]> {
    const mergedPayload = { ...this.payload, ...(await this.requestObject.getPayload()) };
    return authorizationRequestVersionDiscovery(mergedPayload);
  }

  async uri(): Promise<URI> {
    if (!this._uri) {
      this._uri = await URI.fromAuthorizationRequest(this);
    }
    return this._uri;
  }

  /**
   * Verifies a SIOP Request JWT on OP side
   *
   * @param opts
   */
  async verify(opts: VerifyAuthorizationRequestOpts): Promise<VerifiedAuthorizationRequest> {
    assertValidVerifyAuthorizationRequestOpts(opts);

    let requestObjectPayload: RequestObjectPayload;
    let verifiedJwt: VerifiedJWT;

    const jwt = await this.requestObjectJwt();
    if (jwt) {
      parseJWT(jwt);
      const options: JWTVerifyOptions = {
        ...opts.verification?.resolveOpts?.jwtVerifyOpts,
        audience: getAudience(jwt),
      };

      verifiedJwt = await verifyDidJWT(jwt, getResolver(opts.verification.resolveOpts), options);
      if (!verifiedJwt || !verifiedJwt.payload) {
        throw Error(SIOPErrors.ERROR_VERIFYING_SIGNATURE);
      }
      requestObjectPayload = verifiedJwt.payload as RequestObjectPayload;

      if (this.hasRequestObject() && !this.payload.request_uri) {
        // Put back the request object as that won't be present yet
        this.payload.request = jwt;
      }
    }

    // AuthorizationRequest.assertValidRequestObject(origAuthenticationRequest);

    // We use the orig request for default values, but the JWT payload contains signed request object properties
    const mergedPayload = { ...this.payload, ...requestObjectPayload };
    if (opts.state && mergedPayload.state !== opts.state) {
      throw new Error(`${SIOPErrors.BAD_STATE} payload: ${mergedPayload.state}, supplied: ${opts.state}`);
    } else if (opts.nonce && mergedPayload.nonce !== opts.nonce) {
      throw new Error(`${SIOPErrors.BAD_NONCE} payload: ${mergedPayload.nonce}, supplied: ${opts.nonce}`);
    }

    const discoveryKey = mergedPayload['registration'] || mergedPayload['registration_uri'] ? 'registration' : 'client_metadata';
    let registrationMetadataPayload: RPRegistrationMetadataPayload;
    if (mergedPayload[discoveryKey] || mergedPayload[`${discoveryKey}_uri`]) {
      registrationMetadataPayload = await fetchByReferenceOrUseByValue(mergedPayload[`${discoveryKey}_uri`], mergedPayload[discoveryKey]);
      assertValidRPRegistrationMedataPayload(registrationMetadataPayload);
      // TODO: We need to do something with the metadata probably
    }
    await checkWellknownDIDFromRequest(mergedPayload, opts);
    const presentationDefinitions = await PresentationExchange.findValidPresentationDefinitions(mergedPayload, await this.getSupportedVersion());
    return {
      ...verifiedJwt,
      redirectURI: mergedPayload.redirect_uri,
      correlationId: opts.correlationId,
      authorizationRequest: this,
      verifyOpts: opts,
      presentationDefinitions,
      registrationMetadataPayload,
      requestObject: this.requestObject,
      authorizationRequestPayload: this.payload,
      versions: await this.getSupportedVersionsFromPayload(),
    };
  }

  static async verify(requestOrUri: string, verifyOpts: VerifyAuthorizationRequestOpts) {
    assertValidVerifyAuthorizationRequestOpts(verifyOpts);
    const authorizationRequest = await AuthorizationRequest.fromUriOrJwt(requestOrUri);
    return await authorizationRequest.verify(verifyOpts);
  }

  public async requestObjectJwt(): Promise<RequestObjectJwt | undefined> {
    return await this.requestObject?.toJwt();
  }

  private static async fromJwt(jwt: string): Promise<AuthorizationRequest> {
    if (!jwt) {
      throw Error(SIOPErrors.BAD_PARAMS);
    }
    const requestObject = await RequestObject.fromJwt(jwt);
    const payload: AuthorizationRequestPayload = { ...(await requestObject.getPayload()) } as AuthorizationRequestPayload;
    // Although this was a RequestObject we instantiate it as AuthzRequest and then copy in the JWT as the request Object
    payload.request = jwt;
    return new AuthorizationRequest({ ...payload }, requestObject);
  }

  private static async fromURI(uri: URI | string): Promise<AuthorizationRequest> {
    if (!uri) {
      throw Error(SIOPErrors.BAD_PARAMS);
    }
    const uriObject = typeof uri === 'string' ? await URI.fromUri(uri) : uri;
    const requestObject = await RequestObject.fromJwt(uriObject.requestObjectJwt);
    return new AuthorizationRequest(uriObject.authorizationRequestPayload, requestObject, undefined, uriObject);
  }

  public async toStateInfo(): Promise<RequestStateInfo> {
    const requestObject = await this.requestObject.getPayload();
    return {
      client_id: this.options.clientMetadata.client_id,
      iat: requestObject.iat ?? this.payload.iat,
      nonce: requestObject.nonce ?? this.payload.nonce,
      state: this.payload.state,
    };
  }

  public async containsResponseType(singleType: ResponseType | string): Promise<boolean> {
    const responseType: string = await this.getMergedProperty('response_type');
    return responseType?.includes(singleType) === true;
  }

  public async getMergedProperty<T>(key: string): Promise<T | undefined> {
    const merged = await this.mergedPayloads();
    return merged[key] as T;
  }

  public async mergedPayloads(): Promise<RequestObjectPayload> {
    return { ...this.payload, ...(await this.requestObject.getPayload()) };
  }

  public async getPresentationDefinitions(version?: SupportedVersion): Promise<PresentationDefinitionWithLocation[] | undefined> {
    return await PresentationExchange.findValidPresentationDefinitions(await this.mergedPayloads(), version);
  }
}
