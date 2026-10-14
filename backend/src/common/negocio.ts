/**
 * Nombre con el que nace el perfil del negocio (y el que sale en la factura
 * si no hay perfil). Se pasa siempre a mano al crear el perfil: el
 * @default del schema conserva el nombre viejo ("Pastelería María") porque
 * cambiarlo obligaria a recrear la tabla en SQLite solo por un valor por
 * defecto que el codigo ya no usa.
 */
export const NOMBRE_NEGOCIO_POR_DEFECTO = 'Rosa Delicias';
