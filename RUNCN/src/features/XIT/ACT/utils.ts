export function isValidPackageName(name: string) {
  return /^[ 0-9a-zA-Z.\u4e00-\u9fff-]*$/.test(name);
}
