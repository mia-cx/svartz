const config: {
  version: string;
  vaults: Array<{ id: string; path: string; target: { type: "static" } }>;
} = {
  version: "1.0.0",
  vaults: [
    {
      id: "main",
      path: "../valid-vault",
      target: { type: "static" },
    },
  ],
};

export default config;
