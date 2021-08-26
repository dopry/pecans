/**
 * A service that stores assets such as Github Releases, Artifactory, etc.
 */
export class AbstractBackend {
  /** @returns Promise<AbstractAsset[]> */
  getArtifacts() {}
  /** @returns Promise  */
  refreshArtifacts() {}
}

// Assets are what get downloaded and installed on a client computer. This abstract asset defines that standard shape of the class. Each backend should
// Implement it's own asset class that extends this one.
export class AbstractArtifact {
  // Version, these properties should be pre-computed. They're used for searching through assets.
  platform = undefined;
  arch = undefined;
  channel = undefined;
  version = undefined;
  draft = undefined;

  // the following getters return values used to send assets to the client.
  filename = undefined;
  size = undefined;
  content_type = undefined;

  // method to get redirect location for direct to browser download from backend.
  downloadLink() {
    // this class should be extended in an AssetBackend and this method should be overridden with backend specific redirect logic.
    throw new Error("Not Implemented");
  }
}
