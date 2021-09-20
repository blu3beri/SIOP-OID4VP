enum SIOPErrors {
  BAD_PARAMS = 'Wrong parameters provided.',
  MALFORMED_SIGNATURE_RESPONSE = 'Response format is malformed',
  NO_ALG_SUPPORTED = 'Algorithm not supported.',
  NO_KEY_CURVE_SUPPORTED = 'Key Curve not supported.',
  ERROR_VERIFYING_SIGNATURE = 'Error verifying the DID Auth Token signature.',
  ERROR_VALIDATING_NONCE = 'Error validating nonce.',
  NO_AUDIENCE = 'No audience found in JWT payload',
  NO_NONCE = 'No nonce found in JWT payload',
  INVALID_AUDIENCE = 'Audience is invalid. Should be a string value.',
  REQUEST_OBJECT_TYPE_NOT_SET = 'Request object type is not set.',
  NO_REFERENCE_URI = 'referenceUri must be defined when REFERENCE option is used',
  NO_IDENTIFIERS_URI = 'identifiersUri must be defined to get the publick key',
  BAD_SIGNATURE_PARAMS = 'Signature parameters should be internal signature with hexPrivateKey, did, and an optional kid, or external signature parameters with signatureUri, did, and optionals parameters authZToken, hexPublicKey, and kid',
  REGISTRATION_NOT_SET = 'Registration metadata not set.',
  REGISTRATION_OBJECT_TYPE_NOT_SET = 'Registration object type is not set.',
  SIGNATURE_OBJECT_TYPE_NOT_SET = 'Signature object type is not set.',
  DIDAUTH_REQUEST_PAYLOAD_NOT_CREATED = 'DidAuthRequestPayload not created',
  VERIFY_BAD_PARAMS = 'Verify bad parameters',
  VERIFICATION_METHOD_NOT_SUPPORTED = 'Verification method not supported',
  ERROR_RETRIEVING_DID_DOCUMENT = 'Error retrieving did document',
  NO_ISS_DID = 'Token does not have a iss DID',
  BAD_INTERNAL_VERIFICATION_PARAMS = 'Error: One of the either didUrlResolver or both registry and rpcUrl must be set',
  ISS_DID_NOT_JWKS_URI_DID = ' DID in the jwks_uri does NOT match the DID in the iss claim',
  ERROR_RETRIEVING_VERIFICATION_METHOD = 'Error retrieving verificaton method from did document',
  VERIFICATION_METHOD_NO_MATCH = "The verification method from the RP's DID Document does NOT match the kid of the SIOP Request",
  NO_SELFISSUED_ISS = 'The Response Token Issuer Claim (iss) MUST be https://self-isued.me',
  RESPONSE_AUD_MISMATCH_REDIRECT_URI = 'The audience (aud) in Response Token does NOT match the redirect_uri value sent in the Authentication Request',
  SUB_JWK_NOT_FOUND_OR_NOT_KID = 'Response Token does not contains sub_jwk claim or sub_jwk does not contain kid attribute.',
  NO_ALG_SUPPORTED_YET = 'Algorithm is not supported yet. Only ES256 supported for this version.',
  JWK_THUMBPRINT_MISMATCH_SUB = 'JWK computed thumbprint does not match thumbprint included in Response Token sub claim',
  ERROR_ON_POST_CALL = 'Error on Post call: ',
  NO_DID_PAYLOAD = 'payload must contain did field in payload for self-issued tokens',
  NO_JWT = 'no JWT was supplied',
}

export default SIOPErrors;