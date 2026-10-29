## Call graph changes in `src/app/features/dynamic-form`

`main (fixtures/base)` → `feature/vat-check (fixtures/pr)` · **8** changed, **4** added, **1** removed in the feature · dependencies outside it: **+2 −0**, **1** with a changed signature

<sub>Green: added · red, dashed: removed · amber: calls changed (dashed: same calls, different place) · blue: state access changed · thick outline: body changed only. Solid arrows are calls, dotted arrows are reads, thick arrows are outputs reaching a parent template.</sub>

| Change | Where | What |
|---|---|---|
| calls changed | `DynamicFormComponent template` | now calls DynamicFormComponent.hintFor |
| calls changed | `DynamicFormStore.load` | now calls Analytics.track; calls FormApiClient.getDefinition from a different place: was switchMap, piped tap › catchError, now switchMap › defer, piped retry › tap › catchError |
| calls changed | `DynamicFormStore.markTouched` | now calls DynamicFormStore.(revalidate), DynamicFormStore.(verifyVat), allFields; now reads definition, values, verifications |
| calls changed | `DynamicFormStore.setValue` | now calls DynamicFormStore.(revalidate); now reads submitAttempted, touched |
| calls changed | `DynamicFormStore.submit` | now calls DynamicFormStore.(revalidate), Analytics.track; no longer calls RulesEngine.validate; now reads clientErrors; no longer reads definition |
| calls changed | `DynamicFormStore.visibleErrors` | no longer calls DynamicFormStore.clientErrors; now reads clientErrors, verifications |
| signature changed | `FormApiClient.getOptions` (outside) | signature: (source: string, parent: string) => Observable<OptionDto[]> → (source: string, query: { parent: string; locale: string; }) => Observable<OptionDto[]>; called by DynamicFormStore.(loadOptions) |
| added | `Analytics.track` (outside) | called by DynamicFormStore.load, DynamicFormStore.submit |
| added | `DynamicFormComponent.hintFor` | called by DynamicFormComponent template |
| added | `DynamicFormStore.(revalidate)` | called by DynamicFormStore.markTouched, DynamicFormStore.setValue, DynamicFormStore.submit; calls RulesEngine.validate; writes clientErrors |
| added | `DynamicFormStore.(setVerification)` | called by DynamicFormStore.(verifyVat); writes verifications |
| added | `DynamicFormStore.(verifyVat)` | called by DynamicFormStore.markTouched; calls DynamicFormStore.(setVerification), FormApiClient.verifyVat |
| added | `FormApiClient.verifyVat` (outside) | called by DynamicFormStore.(verifyVat) |
| removed | `DynamicFormStore.clientErrors` | was called by DynamicFormStore.visibleErrors; called RulesEngine.validate |
| body changed | `DynamicFormStore.(loadOptions)` | body changed; calls and state access did not |
| body changed | `FieldComponent template` | body changed; calls and state access did not |

### DynamicFormStore.load

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1(["load"])
  end
  subgraph g1["DynamicFormComponent"]
    n0("ngOnInit")
  end
  subgraph g2["RulesEngine"]
    n2("initialValues<br/><small>… 1 more call</small>")
  end
  subgraph outside["Outside the feature"]
    subgraph g3["src/app/shared/analytics"]
      n3[["Analytics.track"]]
    end
    subgraph g4["src/app/shared/api"]
      n4[["FormApiClient.getDefinition"]]
    end
    subgraph g5["src/app/shared/notifications"]
      n5[["Notifier.error"]]
    end
  end
  n0 --> n1
  n1 -->|"switchMap › tap"| n2
  n1 -->|"switchMap › tap"| n3
  n1 -->|"was switchMap, piped tap › catchError, now switchMap › defer, piped retry › tap › catchError"| n4
  n1 -->|"switchMap › catchError"| n5
  classDef added fill:#dcf3e1,stroke:#1f8a3b,stroke-width:2px,color:#1d1c1a
  class n3 added
  classDef structural fill:#fff1cc,stroke:#a86b00,stroke-width:2px,color:#1d1c1a
  class n1 structural
  linkStyle 2 stroke:#1f8a3b,stroke-width:2px
  linkStyle 3 stroke:#a86b00,stroke-width:2px,stroke-dasharray:2 3
```

### DynamicFormStore.markTouched

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1["(revalidate)"]
    n2["(setVerification)"]
    n3["(verifyVat)"]
    n4(["markTouched"])
  end
  subgraph g1["RulesEngine"]
    n5("validate<br/><small>… 2 more calls</small>")
  end
  subgraph g2["DynamicFormComponent"]
    n0>"(blurred) on app-field"]
  end
  subgraph g3["rules-engine.ts"]
    n6("allFields")
  end
  subgraph outside["Outside the feature"]
    subgraph g4["src/app/shared/api"]
      n7[["FormApiClient.verifyVat"]]
    end
  end
  n0 --> n4
  n1 --> n5
  n3 -->|"switchMap"| n2
  n3 -->|"switchMap"| n7
  n4 --> n1
  n4 --> n3
  n4 --> n6
  n5 --> n6
  classDef added fill:#dcf3e1,stroke:#1f8a3b,stroke-width:2px,color:#1d1c1a
  class n1,n2,n3,n7 added
  classDef structural fill:#fff1cc,stroke:#a86b00,stroke-width:2px,color:#1d1c1a
  class n4 structural
  linkStyle 1 stroke:#1f8a3b,stroke-width:2px
  linkStyle 2 stroke:#1f8a3b,stroke-width:2px
  linkStyle 3 stroke:#1f8a3b,stroke-width:2px
  linkStyle 4 stroke:#1f8a3b,stroke-width:2px
  linkStyle 5 stroke:#1f8a3b,stroke-width:2px
  linkStyle 6 stroke:#1f8a3b,stroke-width:2px
```

### DynamicFormStore.setValue

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1["(loadOptions)"]
    n2["(revalidate)"]
    n3(["setValue"])
  end
  subgraph g1["RulesEngine"]
    n4("validate<br/><small>… 2 more calls</small>")
  end
  subgraph g2["DynamicFormComponent"]
    n0>"(valueChange) on app-field"]
  end
  subgraph g3["rules-engine.ts"]
    n5("allFields")
  end
  subgraph outside["Outside the feature"]
    subgraph g4["src/app/shared/api"]
      n6[["FormApiClient.getOptions<br/><small>signature changed</small>"]]
    end
    subgraph g5["src/app/shared/notifications"]
      n7[["Notifier.error"]]
    end
  end
  n0 --> n3
  n1 -->|"mergeMap"| n6
  n1 -->|"mergeMap › catchError"| n7
  n2 --> n4
  n3 --> n1
  n3 --> n2
  n3 --> n5
  n4 --> n5
  classDef added fill:#dcf3e1,stroke:#1f8a3b,stroke-width:2px,color:#1d1c1a
  class n2 added
  classDef structural fill:#fff1cc,stroke:#a86b00,stroke-width:2px,color:#1d1c1a
  class n3,n6 structural
  classDef implementation stroke:#6b6862,stroke-width:3px
  class n1 implementation
  linkStyle 3 stroke:#1f8a3b,stroke-width:2px
  linkStyle 5 stroke:#1f8a3b,stroke-width:2px
```

### DynamicFormStore.submit

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1["(revalidate)"]
    n2(["submit"])
  end
  subgraph g1["DynamicFormComponent"]
    n0("onSubmit")
  end
  subgraph g2["RulesEngine"]
    n3("validate<br/><small>… 3 more calls</small>")
  end
  subgraph outside["Outside the feature"]
    subgraph g3["src/app/shared/analytics"]
      n4[["Analytics.track"]]
    end
    subgraph g4["src/app/shared/api"]
      n5[["FormApiClient.submit"]]
    end
    subgraph g5["src/app/shared/notifications"]
      n6[["Notifier.error"]]
      n7[["Notifier.success"]]
    end
  end
  n0 --> n2
  n1 --> n3
  n2 -->|"exhaustMap"| n1
  n2 -->|"exhaustMap"| n3
  n2 -->|"exhaustMap › tap"| n4
  n2 -->|"exhaustMap"| n5
  n2 -->|"exhaustMap"| n6
  n2 -->|"exhaustMap › tap"| n7
  classDef added fill:#dcf3e1,stroke:#1f8a3b,stroke-width:2px,color:#1d1c1a
  class n1,n4 added
  classDef structural fill:#fff1cc,stroke:#a86b00,stroke-width:2px,color:#1d1c1a
  class n2 structural
  linkStyle 1 stroke:#1f8a3b,stroke-width:2px
  linkStyle 2 stroke:#1f8a3b,stroke-width:2px
  linkStyle 3 stroke:#c2362f,stroke-width:2px,stroke-dasharray:5 3
  linkStyle 4 stroke:#1f8a3b,stroke-width:2px
```

### DynamicFormComponent.hintFor, DynamicFormComponent template, DynamicFormStore.clientErrors and 1 more

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n3{{"clientErrors"}}
    n4{{"visibleErrors"}}
    n5{{"visibleSections<br/><small>… 1 more call</small>"}}
  end
  subgraph g1["DynamicFormComponent"]
    n0("hintFor")
    n1("optionsFor")
    n2[/"template"/]
  end
  subgraph g2["RulesEngine"]
    n6("validate<br/><small>… 3 more calls</small>")
  end
  n2 -.-> n0
  n2 -.-> n1
  n2 -.-> n4
  n2 -.-> n5
  n3 --> n6
  n4 -.-> n3
  classDef added fill:#dcf3e1,stroke:#1f8a3b,stroke-width:2px,color:#1d1c1a
  class n0 added
  classDef removed fill:#fbe0de,stroke:#c2362f,stroke-width:2px,stroke-dasharray:5 3,color:#1d1c1a
  class n3 removed
  classDef structural fill:#fff1cc,stroke:#a86b00,stroke-width:2px,color:#1d1c1a
  class n2,n4 structural
  linkStyle 0 stroke:#1f8a3b,stroke-width:2px
  linkStyle 4 stroke:#c2362f,stroke-width:2px,stroke-dasharray:5 3
  linkStyle 5 stroke:#c2362f,stroke-width:2px,stroke-dasharray:5 3
```

### FieldComponent template

```mermaid
flowchart LR
  subgraph g0["FieldComponent"]
    n0("errorId")
    n1("id")
    n2[/"template"/]
  end
  n0 -.-> n1
  n2 -.-> n0
  n2 -.-> n1
  classDef implementation stroke:#6b6862,stroke-width:3px
  class n2 implementation
```
