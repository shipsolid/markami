# Technical Markdown stays local

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#dbeafe','primaryTextColor':'#172554','primaryBorderColor':'#60a5fa','lineColor':'#93c5fd','secondaryColor':'#ccfbf1','tertiaryColor':'#ffedd5'}}}%%
flowchart LR
  A[Markdown source] --> B[Validated patch]
  B --> C[Rendered document]
  classDef source fill:#dbeafe,stroke:#60a5fa,color:#172554
  classDef patch fill:#ccfbf1,stroke:#2dd4bf,color:#134e4a
  classDef view fill:#ffedd5,stroke:#fb923c,color:#7c2d12
  class A source
  class B patch
  class C view
```

The latency budget is $p_{95} < 50\,ms$ for a local typing update.

```typescript
const patch = { from: 12, to: 18, insert: 'rendered' };
```

| Surface | Network required |
|---|---:|
| Mermaid and math | No |
| Syntax highlighting | No |
