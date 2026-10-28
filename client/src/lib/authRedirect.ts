export type LoginRedirectTarget = Pick<Location, "replace">;

export function redirectToLogin(
  loginUrl: string,
  target: LoginRedirectTarget = window.location,
) {
  target.replace(loginUrl);
}
