import { getDb } from '../api/_lib/db';
import { seedDatabase } from '../api/_lib/seed';

void seedDatabase(getDb());
