// @citation-js/core and its plugins ship no type declarations.
declare module '@citation-js/core' {
  export class Cite {
    constructor(data?: unknown, options?: unknown);
    data: any[];
  }
}

declare module '@citation-js/plugin-bibtex';
