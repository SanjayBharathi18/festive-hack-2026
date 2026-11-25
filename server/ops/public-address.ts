// An address from the configuration, as the console may show it: with no
// user name, password, query or fragment, where a proxy could hold a key.
export function publicAddress(address: string): string {
  const url = new URL(address);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href;
}
