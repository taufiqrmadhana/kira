import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { queryClient } from './lib/queryClient';

afterEach(() => queryClient.clear());
