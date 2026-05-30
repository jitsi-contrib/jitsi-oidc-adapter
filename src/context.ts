// -----------------------------------------------------------------------------
// This function creates the context inside JWT's payload. It gets userInfo
// (which comes from the OIDC userinfo endpoint) as parameter.
//
// Update the codes according to your requirements. Welcome to TypeScript :)
// -----------------------------------------------------------------------------
export interface UserInfo {
  sub: string;
  name?: string;
  preferred_username?: string;
  email?: string;
  picture?: string;
}

export function createContext(userInfo: UserInfo) {
  const context = {
    user: {
      id: userInfo.sub,
      name: userInfo.name?.trim() || userInfo.preferred_username?.trim() || "",
      email: userInfo.email?.trim() || "",
      avatar: userInfo.picture || "",
      lobby_bypass: true,
      security_bypass: true,
    },
  };

  return context;
}
