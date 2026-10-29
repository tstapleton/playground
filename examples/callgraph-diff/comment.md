## Call graph diff

`main (fixtures/base)` → `feature/vat-check (fixtures/pr)` · `src/app/features/dynamic-form` · **4 store methods**: 4 changed, 0 added, 0 removed, 0 unchanged · 2 changes outside them

<sub>Each diagram is a store method and the code it can reach, read from the source on both sides. + added · − removed · Δ changed · ↕ moved to a different point. Code outside the feature is shown but not followed.</sub>

#### What changed

- + **DynamicFormStore** `(revalidate)` now calls **RulesEngine** `validate()` · in 3 diagrams
- + **DynamicFormStore** `markTouched()` now calls **DynamicFormStore** `(revalidate)` · in DynamicFormStore.markTouched
- + **DynamicFormStore** `markTouched()` now calls **DynamicFormStore** `(verifyVat)` · in DynamicFormStore.markTouched
- + **DynamicFormStore** `markTouched()` now calls **rules-engine.ts** `allFields()` · in DynamicFormStore.markTouched
- + **DynamicFormStore** `(verifyVat)` now calls **DynamicFormStore** `(setVerification)` · in DynamicFormStore.markTouched
- + **DynamicFormStore** `(verifyVat)` now calls **FormApiClient** `verifyVat()` · in DynamicFormStore.markTouched
- − **DynamicFormStore** `clientErrors()` no longer calls **RulesEngine** `validate()` · in DynamicFormStore.clientErrors and 3 more
- + **DynamicFormStore** `setValue()` now calls **DynamicFormStore** `(revalidate)` · in DynamicFormStore.setValue
- Δ **FormApiClient** `getOptions()` takes or returns something else: `(source: string, query: { parent: string; locale: string; }) => Observable<Opti…` instead of `(source: string, parent: string) => Observable<OptionDto[]>` · in DynamicFormStore.setValue
- + **DynamicFormStore** `submit()` now calls **DynamicFormStore** `(revalidate)` · in DynamicFormStore.submit
- + **DynamicFormStore** `submit()` now calls **Analytics** `track()` · in DynamicFormStore.submit
- − **DynamicFormStore** `submit()` no longer calls **RulesEngine** `validate()` · in DynamicFormStore.submit
- … and 11 more

| Diagram | | Changes | Dependencies outside the feature |
|---|---|---|---|
| DynamicFormStore.markTouched | changed | +6 Δ1 | + FormApiClient.verifyVat |
| DynamicFormStore.clientErrors and 3 more | changed | +1 −2 Δ2 |  |
| DynamicFormStore.setValue | changed | +2 Δ3 |  |
| DynamicFormStore.submit | changed | +3 −1 Δ1 | + Analytics.track |
| DynamicFormStore.load | changed | +1 Δ1 ↕1 | + Analytics.track |
| FieldComponent template | changed | Δ1 |  |

### Changed: DynamicFormStore.markTouched

`src/app/features/dynamic-form/dynamic-form.store.ts` · +6 Δ1 · new dependency: **FormApiClient.verifyVat**

- + **DynamicFormStore** `(revalidate)` now calls **RulesEngine** `validate()`
- + **DynamicFormStore** `markTouched()` now calls **DynamicFormStore** `(revalidate)`
- + **DynamicFormStore** `markTouched()` now calls **DynamicFormStore** `(verifyVat)`
- + **DynamicFormStore** `markTouched()` now calls **rules-engine.ts** `allFields()`
- + **DynamicFormStore** `(verifyVat)` now calls **DynamicFormStore** `(setVerification)`
- + **DynamicFormStore** `(verifyVat)` now calls **FormApiClient** `verifyVat()`
- Δ **DynamicFormStore** `markTouched()` now also reads `definition`, `values`, `verifications`

<details open><summary>Call graph diff</summary>

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1["+ (revalidate)"]
    n2["+ (setVerification)"]
    n3["+ (verifyVat)"]
    n4(["Δ markTouched"])
  end
  subgraph g1["RulesEngine"]
    n5("validate<br/><small>⋯ 2 more calls</small>")
  end
  subgraph g2["DynamicFormComponent"]
    n0>"(blurred) on app-field"]
  end
  subgraph g3["rules-engine.ts"]
    n6("allFields")
  end
  subgraph outside["Outside the feature"]
    subgraph g4["src/app/shared/api"]
      n7[["FormApiClient.verifyVat (new)"]]
    end
  end
  n0 --> n4
  n1 -->|"+"| n5
  n3 -->|"+ switchMap"| n2
  n3 -->|"+ switchMap"| n7
  n4 -->|"+"| n1
  n4 -->|"+"| n3
  n4 -->|"+"| n6
  n5 --> n6
  classDef added fill:#2ea04329,stroke:#1f8a3b,stroke-width:2px
  class n1,n2,n3,n7 added
  classDef changed fill:#d4a72c3d,stroke:#a86b00,stroke-width:2px
  class n4 changed
  linkStyle 1 stroke:#1f8a3b,stroke-width:2px
  linkStyle 2 stroke:#1f8a3b,stroke-width:2px
  linkStyle 3 stroke:#1f8a3b,stroke-width:2px
  linkStyle 4 stroke:#1f8a3b,stroke-width:2px
  linkStyle 5 stroke:#1f8a3b,stroke-width:2px
  linkStyle 6 stroke:#1f8a3b,stroke-width:2px
```

</details>

### Changed: DynamicFormStore.clientErrors and 3 more

`src/app/features/dynamic-form/dynamic-form.store.ts` · +1 −2 Δ2

- − **DynamicFormStore** `clientErrors()` no longer calls **RulesEngine** `validate()`
- Δ **DynamicFormStore** `visibleErrors()` now also reads `clientErrors`, `verifications`
- − **DynamicFormStore** `visibleErrors()` no longer reads **DynamicFormStore** `clientErrors()`
- + **DynamicFormComponent** template now reads **DynamicFormComponent** `hintFor()`

<details open><summary>Call graph diff</summary>

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n3{{"− clientErrors"}}
    n4{{"Δ visibleErrors"}}
    n5{{"visibleSections<br/><small>⋯ 1 more call</small>"}}
  end
  subgraph g1["DynamicFormComponent"]
    n0("+ hintFor")
    n1("optionsFor")
    n2[/"Δ template"/]
  end
  subgraph g2["RulesEngine"]
    n6("validate<br/><small>⋯ 3 more calls</small>")
  end
  n2 -.->|"+"| n0
  n2 -.-> n1
  n2 -.-> n4
  n2 -.-> n5
  n3 -->|"−"| n6
  n4 -.->|"−"| n3
  classDef added fill:#2ea04329,stroke:#1f8a3b,stroke-width:2px
  class n0 added
  classDef removed fill:#da363324,stroke:#c2362f,stroke-width:2px,stroke-dasharray:4 3
  class n3 removed
  classDef changed fill:#d4a72c3d,stroke:#a86b00,stroke-width:2px
  class n2,n4 changed
  linkStyle 0 stroke:#1f8a3b,stroke-width:2px
  linkStyle 4 stroke:#c2362f,stroke-width:2px,stroke-dasharray:4 3
  linkStyle 5 stroke:#c2362f,stroke-width:2px,stroke-dasharray:4 3
```

</details>

### Changed: DynamicFormStore.setValue

`src/app/features/dynamic-form/dynamic-form.store.ts` · +2 Δ3

- + **DynamicFormStore** `(revalidate)` now calls **RulesEngine** `validate()`
- + **DynamicFormStore** `setValue()` now calls **DynamicFormStore** `(revalidate)`
- Δ **FormApiClient** `getOptions()` takes or returns something else: `(source: string, query: { parent: string; locale: string; }) => Observable<Opti…` instead of `(source: string, parent: string) => Observable<OptionDto[]>`
- Δ **DynamicFormStore** `setValue()` now also reads `submitAttempted`, `touched`
- Δ **DynamicFormStore** `(loadOptions)` changed, but not what it calls or the state it uses

<details open><summary>Call graph diff</summary>

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1["Δ (loadOptions)<br/><small>body only</small>"]
    n2["+ (revalidate)"]
    n3(["Δ setValue"])
  end
  subgraph g1["RulesEngine"]
    n4("validate<br/><small>⋯ 2 more calls</small>")
  end
  subgraph g2["DynamicFormComponent"]
    n0>"(valueChange) on app-field"]
  end
  subgraph g3["rules-engine.ts"]
    n5("allFields")
  end
  subgraph outside["Outside the feature"]
    subgraph g4["src/app/shared/api"]
      n6[["Δ FormApiClient.getOptions<br/><small>was (source: string, parent: string) =#gt; Observable#lt;…</small>"]]
    end
    subgraph g5["src/app/shared/notifications"]
      n7[["Notifier.error"]]
    end
  end
  n0 --> n3
  n1 -->|"mergeMap"| n6
  n1 -->|"mergeMap › catchError"| n7
  n2 -->|"+"| n4
  n3 --> n1
  n3 -->|"+"| n2
  n3 --> n5
  n4 --> n5
  classDef added fill:#2ea04329,stroke:#1f8a3b,stroke-width:2px
  class n2 added
  classDef changed fill:#d4a72c3d,stroke:#a86b00,stroke-width:2px
  class n1,n3,n6 changed
  linkStyle 3 stroke:#1f8a3b,stroke-width:2px
  linkStyle 5 stroke:#1f8a3b,stroke-width:2px
```

</details>

### Changed: DynamicFormStore.submit

`src/app/features/dynamic-form/dynamic-form.store.ts` · +3 −1 Δ1 · new dependency: **Analytics.track**

- + **DynamicFormStore** `(revalidate)` now calls **RulesEngine** `validate()`
- + **DynamicFormStore** `submit()` now calls **DynamicFormStore** `(revalidate)`
- + **DynamicFormStore** `submit()` now calls **Analytics** `track()`
- − **DynamicFormStore** `submit()` no longer calls **RulesEngine** `validate()`
- Δ **DynamicFormStore** `submit()` now also reads `clientErrors`
- Δ **DynamicFormStore** `submit()` no longer reads `definition`

<details open><summary>Call graph diff</summary>

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1["+ (revalidate)"]
    n2(["Δ submit"])
  end
  subgraph g1["DynamicFormComponent"]
    n0("onSubmit")
  end
  subgraph g2["RulesEngine"]
    n3("validate<br/><small>⋯ 3 more calls</small>")
  end
  subgraph outside["Outside the feature"]
    subgraph g3["src/app/shared/analytics"]
      n4[["Analytics.track (new)"]]
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
  n1 -->|"+"| n3
  n2 -->|"+ exhaustMap"| n1
  n2 -->|"− exhaustMap"| n3
  n2 -->|"+ exhaustMap › tap"| n4
  n2 -->|"exhaustMap"| n5
  n2 -->|"exhaustMap"| n6
  n2 -->|"exhaustMap › tap"| n7
  classDef added fill:#2ea04329,stroke:#1f8a3b,stroke-width:2px
  class n1,n4 added
  classDef changed fill:#d4a72c3d,stroke:#a86b00,stroke-width:2px
  class n2 changed
  linkStyle 1 stroke:#1f8a3b,stroke-width:2px
  linkStyle 2 stroke:#1f8a3b,stroke-width:2px
  linkStyle 3 stroke:#c2362f,stroke-width:2px,stroke-dasharray:4 3
  linkStyle 4 stroke:#1f8a3b,stroke-width:2px
```

</details>

### Changed: DynamicFormStore.load

`src/app/features/dynamic-form/dynamic-form.store.ts` · +1 Δ1 ↕1 · new dependency: **Analytics.track**

- + **DynamicFormStore** `load()` now calls **Analytics** `track()`
- ↕ **DynamicFormStore** `load()` calls **FormApiClient** `getDefinition()` at a different point: `switchMap › defer, piped retry › tap › catchError` (was `switchMap, piped tap › catchError`)

<details open><summary>Call graph diff</summary>

```mermaid
flowchart LR
  subgraph g0["DynamicFormStore"]
    n1(["Δ load"])
  end
  subgraph g1["DynamicFormComponent"]
    n0("ngOnInit")
  end
  subgraph g2["RulesEngine"]
    n2("initialValues<br/><small>⋯ 1 more call</small>")
  end
  subgraph outside["Outside the feature"]
    subgraph g3["src/app/shared/analytics"]
      n3[["Analytics.track (new)"]]
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
  n1 -->|"+ switchMap › tap"| n3
  n1 -->|"↕ switchMap › defer, piped retry › tap › catchError, was switchMap, piped tap › catchError"| n4
  n1 -->|"switchMap › catchError"| n5
  classDef added fill:#2ea04329,stroke:#1f8a3b,stroke-width:2px
  class n3 added
  classDef changed fill:#d4a72c3d,stroke:#a86b00,stroke-width:2px
  class n1 changed
  linkStyle 2 stroke:#1f8a3b,stroke-width:2px
  linkStyle 3 stroke:#2f5bd3,stroke-width:2px,stroke-dasharray:2 3
```

</details>

### Changed: FieldComponent template

`src/app/features/dynamic-form/field.component.ts` · Δ1

- Δ **FieldComponent** template changed, but not what it calls or the state it uses

<details open><summary>Call graph diff</summary>

```mermaid
flowchart LR
  subgraph g0["FieldComponent"]
    n0("errorId")
    n1("id")
    n2[/"Δ template<br/><small>body only</small>"/]
  end
  n0 -.-> n1
  n2 -.-> n0
  n2 -.-> n1
  classDef changed fill:#d4a72c3d,stroke:#a86b00,stroke-width:2px
  class n2 changed
```

</details>
