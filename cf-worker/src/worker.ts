import { DurableObject } from 'cloudflare:workers';
import { derivePasswordDigest } from './passwords';

export { default } from './index';

export class PasswordDerivation extends DurableObject {
  derive(password: Uint8Array, salt: Uint8Array): Uint8Array {
    return derivePasswordDigest(password, salt);
  }
}
