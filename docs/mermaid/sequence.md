sequenceDiagram
participant User as User or App
participant Pecans
participant GitHub
participant Developer

    Developer-->>GitHub: Publish Release
    User-->>+Pecans: Request Latest Release
    Pecans-->>GitHub: Request Releases
    GitHub-->>Pecans: Send Releases and Assets metadata
    alt public repo
      Pecans-->>User: Send Public Asset Url
    else private repo
      Pecans-->>GitHub: Request Protected Asset Url for Release Asset
      GitHub-->>Pecans: Send  Download
      Pecans-->>User: Send Protected Asset Url
    end
