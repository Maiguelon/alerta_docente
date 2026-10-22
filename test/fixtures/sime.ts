// Public vacancy/position captured from SIME on 2026-10-22.
// Candidate and applicant records are intentionally never queried.
export const vacancyFixture = {
  vacantes: [
    {
      id: 142900,
      codigo: "PDVC-20261021-143837",
      caracter: "SUPLENTE",
      fechaPublicacionInicio: "22/10/2026 08:00",
      fechaPublicacionFin: "26/10/2026 08:00",
      cargos:
        "[9000433/00] ESC. OBISPO JOSE AGUSTIN MOLINA - MAESTRO ESPECIAL COMUN (1/10) - 121 [PLASTICA] [3 / C # TURNO TARDE] - 136011",
      abierto: false,
    },
  ],
};

export const positionFixture = {
  vacantes: [
    {
      id: 251336,
      ocu_cargo_id: 3063268,
      establecimiento: "[9000433/00] ESC. OBISPO JOSE AGUSTIN MOLINA",
      cargo: "MAESTRO ESPECIAL COMUN  (1/10) - 121##",
      nivel: "PRIMARIO",
      modalidad: "COMÚN",
      materia: "PLASTICA",
      cargos_id: 136011,
      organismo_id: 330,
    },
  ],
};

export const addressFixture = {
  domicilio: {
    calle: "CRISOSTOMO ALVAREZ",
    nro: "334",
    depto: "CAPITAL",
    localidad: "SAN MIGUEL DE TUCUMAN",
    circuito: "CIRCUITO II",
  },
};
