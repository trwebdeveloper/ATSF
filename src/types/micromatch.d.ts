declare module 'micromatch' {
  interface Options {
    basename?: boolean;
    bash?: boolean;
    capture?: boolean;
    contains?: boolean;
    cwd?: string;
    debug?: boolean;
    dot?: boolean;
    expandRange?: (a: string, b: string) => string;
    failglob?: boolean;
    fastpaths?: boolean;
    flags?: string;
    format?: (returnedString: string) => string;
    ignore?: string | string[];
    lookbehinds?: boolean;
    matchBase?: boolean;
    maxLength?: number;
    nobrace?: boolean;
    nobracket?: boolean;
    nocase?: boolean;
    noext?: boolean;
    noextglob?: boolean;
    noglobstar?: boolean;
    nonegate?: boolean;
    noquantifiers?: boolean;
    onIgnore?: (result: { glob: string; regex: RegExp; input: string; output: string }) => void;
    onMatch?: (result: { glob: string; regex: RegExp; input: string; output: string }) => void;
    onResult?: (result: { glob: string; regex: RegExp; input: string; output: string }) => void;
    posix?: boolean;
    prepend?: boolean;
    regex?: boolean;
    strictBrackets?: boolean;
    strictSlashes?: boolean;
    unescape?: boolean;
    windows?: boolean;
  }

  /**
   * Returns an array of strings that match one or more glob patterns.
   */
  function micromatch(list: readonly string[], patterns: string | readonly string[], options?: Options): string[];

  /**
   * Returns true if the specified string matches the given glob pattern.
   */
  function isMatch(str: string, patterns: string | readonly string[], options?: Options): boolean;

  /**
   * Returns a matcher function from the given glob pattern(s).
   */
  function matcher(pattern: string | readonly string[], options?: Options): (str: string) => boolean;

  /**
   * Filter the keys of the given object with the given glob pattern.
   */
  function matchKeys<T extends Record<string, unknown>>(obj: T, patterns: string | readonly string[], options?: Options): Partial<T>;

  /**
   * Returns true if some of the strings in the given list match any of the given glob patterns.
   */
  function some(list: readonly string[], patterns: string | readonly string[], options?: Options): boolean;

  /**
   * Returns true if every string in the given list matches at least one of the given glob patterns.
   */
  function every(list: readonly string[], patterns: string | readonly string[], options?: Options): boolean;

  /**
   * Returns a list of strings that do NOT match any of the given glob patterns.
   */
  function not(list: readonly string[], patterns: string | readonly string[], options?: Options): string[];

  /**
   * Returns true if the given string contains the given pattern.
   */
  function contains(str: string, patterns: string | readonly string[], options?: Options): boolean;

  export default micromatch;
  export { isMatch, matcher, matchKeys, some, every, not, contains };
}
