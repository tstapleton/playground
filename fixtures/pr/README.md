# fixture-pr

A copy of [`fixtures/base`](../base) with a pull request's worth of changes, so the two
can be diffed (`npm run demo:diff` at the repository root):

- Analytics events on form view, submit and rejection (a new host-app participant).
- Validation runs on blur and submit instead of on every keystroke.
- `getOptions` takes `{ parent, locale }` instead of a bare parent value.
- A failed form load is retried once, and the error message changed.
- A new VAT number field is checked against a registry on blur (a new test).
- The "submitted too early" message is reworded, and its test renamed.

```bash
npm test
npm run test:trace
npm run trace:report
```
