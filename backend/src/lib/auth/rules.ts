export type AuthRule =
  | { kind: 'public' }
  | { kind: 'user' }
  | { kind: 'owner'; param: string };

export const Auth = {
  public: (): AuthRule => ({ kind: 'public' }),
  user: (): AuthRule => ({ kind: 'user' }),
  owner: (param: string): AuthRule => ({ kind: 'owner', param })
};
