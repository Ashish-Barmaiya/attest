/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "CommonJS",
          esModuleInterop: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    // Strip the .js extension. Jest will automatically resolve the correct .ts or .js file.
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
