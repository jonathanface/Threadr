export default {
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.tsx?$': 'ts-jest', // Handle TypeScript files
    },
    moduleNameMapper: {
        "\\.(scss|sass|css)$": "identity-obj-proxy"
    },
    extensionsToTreatAsEsm: ['.ts', '.tsx'], // Ensure TS/TSX files are treated as ESM
};
