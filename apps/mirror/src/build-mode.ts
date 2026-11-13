// The static build runs entirely in the browser. The local build can use the vision proxy.
export const hostedRehearsal = import.meta.env.MODE === "pages";
