import tseslint from 'typescript-eslint';
export default tseslint.config(...tseslint.configs.recommended, { ignores: ['dist/**', '.angular/**'], rules: { '@typescript-eslint/no-explicit-any': 'error' } });
