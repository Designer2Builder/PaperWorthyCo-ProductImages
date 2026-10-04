declare module "archiver" {
  import { Transform } from "node:stream";

  interface ZipArchiveOptions {
    zlib?: { level?: number };
    comment?: string;
    forceLocalTime?: boolean;
    store?: boolean;
  }

  export class ZipArchive extends Transform {
    constructor(options?: ZipArchiveOptions);
    file(filepath: string, data: { name: string }): this;
    finalize(): Promise<void>;
    pointer(): number;
  }
}
