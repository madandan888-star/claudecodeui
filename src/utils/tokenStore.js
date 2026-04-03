/**
 * In-memory token store — isolates auth tokens per page/iframe load.
 * Prevents cross-user token leakage when multiple users share the same
 * browser origin (e.g., admin direct tab + operator ypbot iframe).
 */
let _token = null;

export const getToken = () => _token;
export const setToken = (token) => { _token = token; };
export const clearToken = () => { _token = null; };
