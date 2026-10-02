import { describe, it, expect } from "vitest";
import { LOGO_URL } from "../mail/templates/invitacion.template.js";
import {
  renderPasswordChangedEmail,
  renderPasswordResetEmail,
} from "../mail/templates/password-reset.template.js";

const base = {
  link: "http://front.test/restablecer-contrasena/TOKEN-123",
  minutos: 30,
};

describe("renderPasswordResetEmail", () => {
  it("arma subject, text y html con el enlace y la vigencia", () => {
    const mail = renderPasswordResetEmail(base);

    expect(mail.subject).toBe("Restablecé tu contraseña de MeetFlow");
    expect(mail.text).toContain(base.link);
    expect(mail.text).toContain("30 minutos");
    expect(mail.html).toContain(`href="${base.link}"`);
    expect(mail.html).toContain("30 minutos");
    expect(mail.html).toContain("Restablecer contraseña");
  });

  it("usa el logo PNG de MeetFlow", () => {
    const mail = renderPasswordResetEmail(base);

    expect(mail.html).toContain(`src="${LOGO_URL}"`);
    expect(mail.html).toContain('alt="MeetFlow"');
  });

  it("incluye el enlace como respaldo si el botón no funciona", () => {
    const mail = renderPasswordResetEmail(base);

    expect(mail.html.split(base.link).length - 1).toBeGreaterThanOrEqual(2);
  });

  it("avisa que se ignore el correo si no lo pidió", () => {
    const mail = renderPasswordResetEmail(base);

    expect(mail.text).toContain("ignorá este correo");
    expect(mail.html).toContain("ignorá este correo");
  });

  it("escapa el nombre: lo carga el usuario y no debe inyectar HTML", () => {
    const mail = renderPasswordResetEmail({
      ...base,
      nombre: '<img src=x onerror="alert(1)"> & "Ana"',
    });

    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &quot;Ana&quot;",
    );
  });

  it("escapa el enlace en el HTML", () => {
    const mail = renderPasswordResetEmail({
      ...base,
      link: 'http://front.test/x"><script>alert(1)</script>',
    });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("saluda por nombre si se conoce y es neutro si no", () => {
    const conNombre = renderPasswordResetEmail({ ...base, nombre: "Ana" });
    const sinNombre = renderPasswordResetEmail(base);

    expect(conNombre.text).toContain("Hola Ana");
    expect(sinNombre.text).toContain("Hola,");
    expect(sinNombre.html).not.toContain("undefined");
  });
});

describe("renderPasswordChangedEmail", () => {
  it("avisa del cambio de contraseña y qué hacer si no fue el usuario", () => {
    const mail = renderPasswordChangedEmail({
      nombre: "Ana",
      loginUrl: "http://front.test/login",
    });

    expect(mail.subject).toBe("Tu contraseña de MeetFlow fue cambiada");
    expect(mail.text).toContain("Hola Ana");
    expect(mail.text).toContain("http://front.test/login");
    expect(mail.html).toContain(`src="${LOGO_URL}"`);
    expect(mail.html).toContain("Si no fuiste vos");
  });

  it("no promete cierre inmediato de todas las sesiones (el access token dura hasta 15 min)", () => {
    const mail = renderPasswordChangedEmail({ nombre: "Ana", loginUrl: "http://front.test/login" });

    for (const texto of [mail.text, mail.html]) {
      expect(texto).toContain("pueden tardar hasta 15 minutos en cerrarse por completo");
      expect(texto).not.toContain("cerramos tus sesiones abiertas");
    }
  });

  it("escapa el nombre", () => {
    const mail = renderPasswordChangedEmail({
      nombre: "<b>Ana</b>",
      loginUrl: "http://front.test/login",
    });

    expect(mail.html).not.toContain("<b>Ana</b>");
    expect(mail.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
  });
});
