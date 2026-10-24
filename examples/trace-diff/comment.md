## Behaviour diff

`main (fixtures/base)` → `feature/vat-check (fixtures/pr)` · **8 tests**: 7 changed, 1 added, 0 removed, 0 unchanged (1 renamed)

<sub>Each diagram is one integration test, recorded on both sides. + added · − removed · Δ changed · ↕ moved. Unchanged stretches are collapsed.</sub>

| Test | | Steps | Participants |
|---|---|---|---|
| Dynamic form shows field errors returned by the server | changed | +7 −2 Δ1 ↕10 | + Analytics |
| Dynamic form submits a valid form and shows the reference | changed | +7 −2 Δ1 ↕10 | + Analytics |
| Dynamic form loads regions for the selected country | changed | +1 −4 Δ1 | + Analytics, − Rules engine |
| Dynamic form lists what is missing when submitted too early<br><sub>was: Dynamic form blocks submission while required fields are missing</sub> | renamed | +2 −2 Δ1 ↕2 | + Analytics |
| Dynamic form shows and validates the registration number only for limited companies | changed | +3 −2 ↕4 | + Analytics |
| Dynamic form loads the form definition from the backend and renders its sections | changed | +1 −2 | + Analytics, − Rules engine |
| Dynamic form tells the user when the form cannot be loaded | changed | +2 Δ1 |  |
| Dynamic form checks a UK VAT number against the registry when the field is left | added | 28 steps |  |

### Changed: Dynamic form shows field errors returned by the server

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · +7 −2 Δ1 ↕10 · new participant: **Analytics**

<details open><summary>Sequence diff</summary>

```mermaid
sequenceDiagram
  actor U as User
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
    participant P2 as Rules engine
  end
  box Host app (mocked)
    participant P3 as Form API
    participant P4 as Analytics (new)
    participant P5 as Notifier
  end
  Note over U,P5: ⋯ 3 unchanged steps ⋯
  P3-->>P1: {id: "vendor-onboarding", …}
  Note over P1: definition: {id: "vendor-onboarding", …}<br/>status: "loading" → "ready"<br/>values: {companyName: null, companyType: null, registrationNumber: null, …}
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_viewed", {formId: "vendor-onboarding"})
  end
  rect rgba(218, 54, 51, 0.14)
    P1->>P2: − validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
    P2-->>P1: − {companyName: [1], companyType: [1], country: [1], …}
  end
  U->>P0: types "Acme" into "Company name"
  P0->>P1: setValue("companyName", "Acme")
  Note over P1: values.companyName: null → "Acme"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("companyName")
    Note over P1: ↕ touched: {companyName: true}
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: null, …})
  P2-->>P1: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}
  end
  U->>P0: selects "Sole trader" in "Company type"
  P0->>P1: setValue("companyType", "sole")
  Note over P1: values.companyType: null → "sole"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("companyType")
    Note over P1: ↕ touched.companyType: true
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
  P2-->>P1: {country: [1], region: [1], acceptsTerms: [1]}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.companyType: removed<br/>clientErrors.country: ["Country is required"]<br/>clientErrors.region: ["Region is required"]<br/>clientErrors.acceptsTerms: ["I accept the supplier terms is required"]
  end
  U->>P0: selects "United Kingdom" in "Country"
  P0->>P1: setValue("country", "GB")
  Note over P1: values.country: null → "GB"
  rect rgba(212, 167, 44, 0.24)
    P1->>P3: Δ getOptions("regions", {parent: "GB", locale: "en-US"})
    Note over P1,P3: was getOptions("regions", "GB")
  end
  P3-->>P1: [{…2}, {…2}]
  Note over P1: remoteOptions: {region: [2]}
  P0->>P1: markTouched("country")
  Note over P1: touched.country: true
  rect rgba(56, 132, 255, 0.14)
    P1->>P2: ↕ validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
    P2-->>P1: ↕ {region: [1], acceptsTerms: [1]}
  end
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.country: removed<br/>clientErrors.region: ["Region is required"]<br/>clientErrors.acceptsTerms: ["I accept the supplier terms is required"]
  end
  U->>P0: selects "Scotland" in "Region"
  P0->>P1: setValue("region", "SCT")
  Note over P1: values.region: null → "SCT"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("region")
    Note over P1: ↕ touched.region: true
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
  P2-->>P1: {acceptsTerms: [1]}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.region: removed<br/>clientErrors.acceptsTerms: ["I accept the supplier terms is required"]
  end
  U->>P0: checks "I accept the supplier terms"
  P0->>P1: setValue("acceptsTerms", true)
  Note over P1: values.acceptsTerms: false → true
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("acceptsTerms")
    Note over P1: ↕ touched.acceptsTerms: true
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
  P2-->>P1: {}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.acceptsTerms: removed
  end
  U->>P0: clicks "Send for approval"
  P0->>P1: submit()
  Note over U,P5: ⋯ 6 unchanged steps ⋯
  Note over P1: status: "submitting" → "ready"<br/>serverErrors: {companyName: [1]}
  P1->>P5: error("The server rejected some answers")
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_rejected", {formId: "vendor-onboarding", …})
  end
```

</details>

<details><summary>Changes as text</summary>

- + Form store → Analytics: `track("form_viewed", {formId: "vendor-onboarding"})`
- − Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})`
- − Rules engine ⇠ Form store: `{companyName: [1], companyType: [1], country: [1], …}`
- ↕ UI → Form store: `markTouched("companyName")`
- ↕ Form store state: `touched: {companyName: true}`
- + Form store state: `clientErrors: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}`
- ↕ UI → Form store: `markTouched("companyType")`
- ↕ Form store state: `touched.companyType: true`
- + Form store state: `clientErrors.companyType: removed, clientErrors.country: ["Country is required"], clientErrors.region: ["Region is required"], clientErrors.acceptsTerms: ["I accept the supplier terms is required"]`
- Δ Form store → Form API: `getOptions("regions", {parent: "GB", locale: "en-US"})` (was `getOptions("regions", "GB")`)
- ↕ Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})`
- ↕ Rules engine ⇠ Form store: `{region: [1], acceptsTerms: [1]}`
- + Form store state: `clientErrors.country: removed, clientErrors.region: ["Region is required"], clientErrors.acceptsTerms: ["I accept the supplier terms is required"]`
- ↕ UI → Form store: `markTouched("region")`
- ↕ Form store state: `touched.region: true`
- + Form store state: `clientErrors.region: removed, clientErrors.acceptsTerms: ["I accept the supplier terms is required"]`
- ↕ UI → Form store: `markTouched("acceptsTerms")`
- ↕ Form store state: `touched.acceptsTerms: true`
- + Form store state: `clientErrors.acceptsTerms: removed`
- + Form store → Analytics: `track("form_rejected", {formId: "vendor-onboarding", …})`

</details>

### Changed: Dynamic form submits a valid form and shows the reference

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · +7 −2 Δ1 ↕10 · new participant: **Analytics**

<details open><summary>Sequence diff</summary>

```mermaid
sequenceDiagram
  actor U as User
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
    participant P2 as Rules engine
  end
  box Host app (mocked)
    participant P3 as Form API
    participant P4 as Analytics (new)
    participant P5 as Notifier
  end
  Note over U,P5: ⋯ 3 unchanged steps ⋯
  P3-->>P1: {id: "vendor-onboarding", …}
  Note over P1: definition: {id: "vendor-onboarding", …}<br/>status: "loading" → "ready"<br/>values: {companyName: null, companyType: null, registrationNumber: null, …}
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_viewed", {formId: "vendor-onboarding"})
  end
  rect rgba(218, 54, 51, 0.14)
    P1->>P2: − validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
    P2-->>P1: − {companyName: [1], companyType: [1], country: [1], …}
  end
  U->>P0: types "Acme" into "Company name"
  P0->>P1: setValue("companyName", "Acme")
  Note over P1: values.companyName: null → "Acme"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("companyName")
    Note over P1: ↕ touched: {companyName: true}
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: null, …})
  P2-->>P1: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}
  end
  U->>P0: selects "Sole trader" in "Company type"
  P0->>P1: setValue("companyType", "sole")
  Note over P1: values.companyType: null → "sole"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("companyType")
    Note over P1: ↕ touched.companyType: true
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
  P2-->>P1: {country: [1], region: [1], acceptsTerms: [1]}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.companyType: removed<br/>clientErrors.country: ["Country is required"]<br/>clientErrors.region: ["Region is required"]<br/>clientErrors.acceptsTerms: ["I accept the supplier terms is required"]
  end
  U->>P0: selects "United Kingdom" in "Country"
  P0->>P1: setValue("country", "GB")
  Note over P1: values.country: null → "GB"
  rect rgba(212, 167, 44, 0.24)
    P1->>P3: Δ getOptions("regions", {parent: "GB", locale: "en-US"})
    Note over P1,P3: was getOptions("regions", "GB")
  end
  P3-->>P1: [{…2}, {…2}]
  Note over P1: remoteOptions: {region: [2]}
  P0->>P1: markTouched("country")
  Note over P1: touched.country: true
  rect rgba(56, 132, 255, 0.14)
    P1->>P2: ↕ validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
    P2-->>P1: ↕ {region: [1], acceptsTerms: [1]}
  end
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.country: removed<br/>clientErrors.region: ["Region is required"]<br/>clientErrors.acceptsTerms: ["I accept the supplier terms is required"]
  end
  U->>P0: selects "Scotland" in "Region"
  P0->>P1: setValue("region", "SCT")
  Note over P1: values.region: null → "SCT"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("region")
    Note over P1: ↕ touched.region: true
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
  P2-->>P1: {acceptsTerms: [1]}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.region: removed<br/>clientErrors.acceptsTerms: ["I accept the supplier terms is required"]
  end
  U->>P0: checks "I accept the supplier terms"
  P0->>P1: setValue("acceptsTerms", true)
  Note over P1: values.acceptsTerms: false → true
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("acceptsTerms")
    Note over P1: ↕ touched.acceptsTerms: true
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})
  P2-->>P1: {}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.acceptsTerms: removed
  end
  U->>P0: clicks "Send for approval"
  P0->>P1: submit()
  Note over U,P5: ⋯ 6 unchanged steps ⋯
  Note over P1: status: "submitting" → "submitted"<br/>referenceId: null → "VND-1042"
  P1->>P5: success("Submitted (VND-1042)")
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_submitted", {formId: "vendor-onboarding", …})
  end
```

</details>

<details><summary>Changes as text</summary>

- + Form store → Analytics: `track("form_viewed", {formId: "vendor-onboarding"})`
- − Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})`
- − Rules engine ⇠ Form store: `{companyName: [1], companyType: [1], country: [1], …}`
- ↕ UI → Form store: `markTouched("companyName")`
- ↕ Form store state: `touched: {companyName: true}`
- + Form store state: `clientErrors: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}`
- ↕ UI → Form store: `markTouched("companyType")`
- ↕ Form store state: `touched.companyType: true`
- + Form store state: `clientErrors.companyType: removed, clientErrors.country: ["Country is required"], clientErrors.region: ["Region is required"], clientErrors.acceptsTerms: ["I accept the supplier terms is required"]`
- Δ Form store → Form API: `getOptions("regions", {parent: "GB", locale: "en-US"})` (was `getOptions("regions", "GB")`)
- ↕ Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: "sole", …})`
- ↕ Rules engine ⇠ Form store: `{region: [1], acceptsTerms: [1]}`
- + Form store state: `clientErrors.country: removed, clientErrors.region: ["Region is required"], clientErrors.acceptsTerms: ["I accept the supplier terms is required"]`
- ↕ UI → Form store: `markTouched("region")`
- ↕ Form store state: `touched.region: true`
- + Form store state: `clientErrors.region: removed, clientErrors.acceptsTerms: ["I accept the supplier terms is required"]`
- ↕ UI → Form store: `markTouched("acceptsTerms")`
- ↕ Form store state: `touched.acceptsTerms: true`
- + Form store state: `clientErrors.acceptsTerms: removed`
- + Form store → Analytics: `track("form_submitted", {formId: "vendor-onboarding", …})`

</details>

### Changed: Dynamic form loads regions for the selected country

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · +1 −4 Δ1 · new participant: **Analytics** · no longer calls: **Rules engine**

<details open><summary>Sequence diff</summary>

```mermaid
sequenceDiagram
  actor U as User
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
    participant P2 as Rules engine (removed)
  end
  box Host app (mocked)
    participant P3 as Form API
    participant P4 as Analytics (new)
  end
  Note over U,P4: ⋯ 3 unchanged steps ⋯
  P3-->>P1: {id: "vendor-onboarding", …}
  Note over P1: definition: {id: "vendor-onboarding", …}<br/>status: "loading" → "ready"<br/>values: {companyName: null, companyType: null, registrationNumber: null, …}
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_viewed", {formId: "vendor-onboarding"})
  end
  rect rgba(218, 54, 51, 0.14)
    P1->>P2: − validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
    P2-->>P1: − {companyName: [1], companyType: [1], country: [1], …}
  end
  U->>P0: selects "United States" in "Country"
  P0->>P1: setValue("country", "US")
  Note over P1: values.country: null → "US"
  rect rgba(212, 167, 44, 0.24)
    P1->>P3: Δ getOptions("regions", {parent: "US", locale: "en-US"})
    Note over P1,P3: was getOptions("regions", "US")
  end
  rect rgba(218, 54, 51, 0.14)
    P1->>P2: − validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
    P2-->>P1: − {companyName: [1], companyType: [1], region: [1], …}
  end
  P3-->>P1: [{…2}]
  Note over P1: remoteOptions: {region: [1]}
```

</details>

<details><summary>Changes as text</summary>

- + Form store → Analytics: `track("form_viewed", {formId: "vendor-onboarding"})`
- − Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})`
- − Rules engine ⇠ Form store: `{companyName: [1], companyType: [1], country: [1], …}`
- Δ Form store → Form API: `getOptions("regions", {parent: "US", locale: "en-US"})` (was `getOptions("regions", "US")`)
- − Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})`
- − Rules engine ⇠ Form store: `{companyName: [1], companyType: [1], region: [1], …}`

</details>

### Renamed and changed: Dynamic form lists what is missing when submitted too early

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · +2 −2 Δ1 ↕2 · was “Dynamic form blocks submission while required fields are missing” · new participant: **Analytics**

<details open><summary>Sequence diff</summary>

```mermaid
sequenceDiagram
  actor U as User
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
    participant P2 as Rules engine
  end
  box Host app (mocked)
    participant P3 as Form API
    participant P4 as Analytics (new)
    participant P5 as Notifier
  end
  Note over U,P5: ⋯ 3 unchanged steps ⋯
  P3-->>P1: {id: "vendor-onboarding", …}
  Note over P1: definition: {id: "vendor-onboarding", …}<br/>status: "loading" → "ready"<br/>values: {companyName: null, companyType: null, registrationNumber: null, …}
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_viewed", {formId: "vendor-onboarding"})
  end
  rect rgba(218, 54, 51, 0.14)
    P1->>P2: − validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
    P2-->>P1: − {companyName: [1], companyType: [1], country: [1], …}
  end
  U->>P0: types "Acme" into "Company name"
  P0->>P1: setValue("companyName", "Acme")
  Note over P1: values.companyName: null → "Acme"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("companyName")
    Note over P1: ↕ touched: {companyName: true}
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: null, …})
  P2-->>P1: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}
  end
  U->>P0: clicks "Send for approval"
  P0->>P1: submit()
  Note over P1: submitAttempted: false → true
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: "Acme", companyType: null, …})
  P2-->>P1: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}
  rect rgba(212, 167, 44, 0.24)
    P1->>P5: Δ error("4 fields need your attention")
    Note over P1,P5: was error("Please fix 4 fields")
  end
```

</details>

<details><summary>Changes as text</summary>

- + Form store → Analytics: `track("form_viewed", {formId: "vendor-onboarding"})`
- − Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})`
- − Rules engine ⇠ Form store: `{companyName: [1], companyType: [1], country: [1], …}`
- ↕ UI → Form store: `markTouched("companyName")`
- ↕ Form store state: `touched: {companyName: true}`
- + Form store state: `clientErrors: {companyType: [1], country: [1], region: [1], acceptsTerms: [1]}`
- Δ Form store → Notifier: `error("4 fields need your attention")` (was `error("Please fix 4 fields")`)

</details>

### Changed: Dynamic form shows and validates the registration number only for limited companies

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · +3 −2 ↕4 · new participant: **Analytics**

<details open><summary>Sequence diff</summary>

```mermaid
sequenceDiagram
  actor U as User
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
    participant P2 as Rules engine
  end
  box Host app (mocked)
    participant P3 as Form API
    participant P4 as Analytics (new)
  end
  Note over U,P4: ⋯ 3 unchanged steps ⋯
  P3-->>P1: {id: "vendor-onboarding", …}
  Note over P1: definition: {id: "vendor-onboarding", …}<br/>status: "loading" → "ready"<br/>values: {companyName: null, companyType: null, registrationNumber: null, …}
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_viewed", {formId: "vendor-onboarding"})
  end
  rect rgba(218, 54, 51, 0.14)
    P1->>P2: − validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
    P2-->>P1: − {companyName: [1], companyType: [1], country: [1], …}
  end
  U->>P0: selects "Limited company" in "Company type"
  P0->>P1: setValue("companyType", "limited")
  Note over P1: values.companyType: null → "limited"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("companyType")
    Note over P1: ↕ touched: {companyType: true}
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: null, companyType: "limited", …})
  P2-->>P1: {companyName: [1], registrationNumber: [1], country: [1], …}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors: {companyName: [1], registrationNumber: [1], country: [1], …}
  end
  U->>P0: types "123" into "Registration number"
  P0->>P1: setValue("registrationNumber", "123")
  Note over P1: values.registrationNumber: null → "123"
  rect rgba(56, 132, 255, 0.14)
    P0->>P1: ↕ markTouched("registrationNumber")
    Note over P1: ↕ touched.registrationNumber: true
  end
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: null, companyType: "limited", …})
  P2-->>P1: {companyName: [1], registrationNumber: [1], country: [1], …}
  rect rgba(46, 160, 67, 0.16)
    Note over P1: + clientErrors.companyName: ["Company name is required"]<br/>clientErrors.registrationNumber: ["Must be 8 digits"]<br/>clientErrors.country: ["Country is required"]<br/>clientErrors.region: ["Region is required"]<br/>clientErrors.acceptsTerms: ["I accept the supplier terms is required"]
  end
```

</details>

<details><summary>Changes as text</summary>

- + Form store → Analytics: `track("form_viewed", {formId: "vendor-onboarding"})`
- − Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})`
- − Rules engine ⇠ Form store: `{companyName: [1], companyType: [1], country: [1], …}`
- ↕ UI → Form store: `markTouched("companyType")`
- ↕ Form store state: `touched: {companyType: true}`
- + Form store state: `clientErrors: {companyName: [1], registrationNumber: [1], country: [1], …}`
- ↕ UI → Form store: `markTouched("registrationNumber")`
- ↕ Form store state: `touched.registrationNumber: true`
- + Form store state: `clientErrors.companyName: ["Company name is required"], clientErrors.registrationNumber: ["Must be 8 digits"], clientErrors.country: ["Country is required"], clientErrors.region: ["Region is required"], clientErrors.acceptsTerms: ["I accept the supplier terms is required"]`

</details>

### Changed: Dynamic form loads the form definition from the backend and renders its sections

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · +1 −2 · new participant: **Analytics** · no longer calls: **Rules engine**

<details open><summary>Sequence diff</summary>

```mermaid
sequenceDiagram
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
    participant P2 as Rules engine (removed)
  end
  box Host app (mocked)
    participant P3 as Form API
    participant P4 as Analytics (new)
  end
  Note over P0,P4: ⋯ 3 unchanged steps ⋯
  P3-->>P1: {id: "vendor-onboarding", …}
  Note over P1: definition: {id: "vendor-onboarding", …}<br/>status: "loading" → "ready"<br/>values: {companyName: null, companyType: null, registrationNumber: null, …}
  rect rgba(46, 160, 67, 0.16)
    P1->>P4: + track("form_viewed", {formId: "vendor-onboarding"})
  end
  rect rgba(218, 54, 51, 0.14)
    P1->>P2: − validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
    P2-->>P1: − {companyName: [1], companyType: [1], country: [1], …}
  end
```

</details>

<details><summary>Changes as text</summary>

- + Form store → Analytics: `track("form_viewed", {formId: "vendor-onboarding"})`
- − Form store → Rules engine: `validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})`
- − Rules engine ⇠ Form store: `{companyName: [1], companyType: [1], country: [1], …}`

</details>

### Changed: Dynamic form tells the user when the form cannot be loaded

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · +2 Δ1

<details open><summary>Sequence diff</summary>

```mermaid
sequenceDiagram
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
  end
  box Host app (mocked)
    participant P2 as Form API
    participant P3 as Notifier
  end
  Note over P0,P3: ⋯ 2 unchanged steps ⋯
  P1->>P2: getDefinition("vendor-onboarding")
  P2--xP1: Error: 503 Service Unavailable
  rect rgba(46, 160, 67, 0.16)
    P1->>P2: + getDefinition("vendor-onboarding")
    P2--xP1: + Error: 503 Service Unavailable
  end
  Note over P1: status: "loading" → "error"
  rect rgba(212, 167, 44, 0.24)
    P1->>P3: Δ error("This form could not be loaded. Please r…")
    Note over P1,P3: was error("This form could not be loaded")
  end
```

</details>

<details><summary>Changes as text</summary>

- + Form store → Form API: `getDefinition("vendor-onboarding")`
- + Form API ✕ Form store: `Error: 503 Service Unavailable`
- Δ Form store → Notifier: `error("This form could not be loaded. Please r…")` (was `error("This form could not be loaded")`)

</details>

### New test: Dynamic form checks a UK VAT number against the registry when the field is left

`src/app/features/dynamic-form/dynamic-form.integration.spec.ts` · 28 steps

<details><summary>Sequence diagram</summary>

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  box Dynamic form feature
    participant P0 as UI
    participant P1 as Form store
    participant P2 as Rules engine
  end
  box Host app (mocked)
    participant P3 as Form API
    participant P4 as Analytics
  end
  P0->>P1: load("vendor-onboarding")
  Note over P1: formId: null → "vendor-onboarding"<br/>status: "idle" → "loading"
  P1->>P3: getDefinition("vendor-onboarding")
  P3-->>P1: {id: "vendor-onboarding", …}
  Note over P1: definition: {id: "vendor-onboarding", …}<br/>status: "loading" → "ready"<br/>values: {companyName: null, companyType: null, registrationNumber: null, …}
  P1->>P4: track("form_viewed", {formId: "vendor-onboarding"})
  U->>P0: selects "United Kingdom" in "Country"
  P0->>P1: setValue("country", "GB")
  Note over P1: values.country: null → "GB"
  P1->>P3: getOptions("regions", {parent: "GB", locale: "en-US"})
  P3-->>P1: [{…2}, {…2}]
  Note over P1: remoteOptions: {region: [2]}
  P0->>P1: markTouched("country")
  Note over P1: touched: {country: true}
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
  P2-->>P1: {companyName: [1], companyType: [1], region: [1], …}
  Note over P1: clientErrors: {companyName: [1], companyType: [1], region: [1], …}
  U->>P0: types "GB123456789" into "VAT number"
  P0->>P1: setValue("vatNumber", "GB123456789")
  Note over P1: values.vatNumber: null → "GB123456789"
  P0->>P1: markTouched("vatNumber")
  Note over P1: touched.vatNumber: true
  P1->>P2: validate({id: "vendor-onboarding", …}, {companyName: null, companyType: null, …})
  P2-->>P1: {companyName: [1], companyType: [1], region: [1], …}
  Note over P1: verifications: {vatNumber: {…2}}
  P1->>P3: verifyVat("GB123456789")
  P3-->>P1: {valid: true, registeredName: "ACME LTD"}
  Note over P1: verifications.vatNumber: {value: "GB123456789", status: "valid", detail: "ACME LTD"}
```

</details>
