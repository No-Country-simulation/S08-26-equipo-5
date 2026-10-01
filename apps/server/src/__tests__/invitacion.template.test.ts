import { describe, it, expect } from "vitest";
import {
  renderInvitacionEmail,
  LOGO_URL,
} from "../mail/templates/invitacion.template.js";

const base = {
  salaNombre: "Sala Q4",
  link: "http://front.test/invitacion/TOKEN-123",
  horas: 72,
};

describe("renderInvitacionEmail", () => {
  it("arma subject, text y html con el enlace de la invitación", () => {
    const mail = renderInvitacionEmail(base);

    expect(mail.subject).toBe('Te invitaron a la sala "Sala Q4"');
    expect(mail.text).toContain(base.link);
    expect(mail.text).toContain("72 horas");
    expect(mail.html).toContain(`href="${base.link}"`);
    expect(mail.html).toContain("72 horas");
  });

  it("usa el logo en PNG (los clientes de correo no renderizan SVG)", () => {
    const mail = renderInvitacionEmail(base);

    expect(LOGO_URL).toMatch(/\.png$/);
    expect(mail.html).toContain(`src="${LOGO_URL}"`);
    expect(mail.html).toContain('alt="MeetFlow"');
  });

  it("escapa el nombre de la sala: lo carga el host y no debe inyectar HTML", () => {
    const mail = renderInvitacionEmail({
      ...base,
      salaNombre: '<img src=x onerror="alert(1)"> & "Q4"',
    });

    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;Q4&quot;");
  });

  it("nombra al host cuando se conoce y usa un texto neutro si no", () => {
    const conHost = renderInvitacionEmail({ ...base, hostNombre: "Ana <b>Pérez</b>" });
    const sinHost = renderInvitacionEmail(base);

    expect(conHost.html).toContain("Ana &lt;b&gt;Pérez&lt;/b&gt;");
    expect(conHost.text).toContain("Ana <b>Pérez</b> te invitó");
    expect(sinHost.text).toContain("Te invitaron");
    expect(sinHost.html).not.toContain("undefined");
  });

  it("incluye el enlace en texto plano como respaldo si el botón no funciona", () => {
    const mail = renderInvitacionEmail(base);
    const apariciones = mail.html.split(base.link).length - 1;

    expect(apariciones).toBeGreaterThanOrEqual(2);
  });
});
