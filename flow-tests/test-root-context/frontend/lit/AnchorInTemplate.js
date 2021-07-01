
import { LitElement, html } from "lit-element";

export class AnchorInTemplate extends LitElement {
  render() {
    return html`
        <a href="" download id="anchor">Download</a>
    `;
  }
}
customElements.define("anchor-in-template", AnchorInTemplate);
