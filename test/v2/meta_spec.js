import "should";
import {
  ARCH,
  PLATFORM,
  filenameToArch,
  filenameToPlatform,
  stringToVersion,
  versionToChannel,
} from "../../lib/v2/meta.js";

describe("meta.js - version meta data parsing functions", () => {
  describe("filenameToArch", () => {
    it("parsers Arch from filename", () => {
      filenameToArch("myapp-v0.25.1-darwin-x64.zip").should.be.exactly(
        ARCH.X64
      );
    });
  });
  describe("filenameToPlatform", () => {
    filenameToPlatform("myapp-v0.25.1-darwin-x64.zip").should.be.exactly(
      PLATFORM.DARWIN
    );
  });
  describe("filenameToPlatform", () => {
    stringToVersion("myapp-v0.25.1-next-darwin-x64.zip").should.be.exactly(
      "0.25.1"
    );
    stringToVersion("myapp-v0.25.1-next.7-darwin-x64.zip").should.be.exactly(
      "0.25.1-next.7"
    );
  });
  describe("filenameToPlatform", () => {
    versionToChannel("0.25.1-next.7").should.be.exactly("next");
    versionToChannel("0.25.1-next").should.be.exactly("next");
    versionToChannel("0.25.1").should.be.exactly("stable");
  });
});
