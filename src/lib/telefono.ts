/** Devuelve el número internacional que espera wa.me sin duplicar el +52. */
export function telefonoWhatsAppMexico(valor: string): string {
  const digitos = valor.replace(/\D/g, "");

  // Formato histórico mexicano +52 1 + diez dígitos.
  if (digitos.length === 13 && digitos.startsWith("521")) {
    return `52${digitos.slice(3)}`;
  }
  if (digitos.length === 12 && digitos.startsWith("52")) return digitos;
  if (digitos.length === 10) return `52${digitos}`;

  // Para otro país o un dato incompleto no inventamos prefijos.
  return digitos;
}
