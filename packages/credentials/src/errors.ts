export class CredentialError extends Error {
 constructor(public readonly code:string){super(code);this.name='CredentialError';}
}
