/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: "https://rewards.bing.com/"
  },
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
};
