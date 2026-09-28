export interface DatabaseConnection {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: unknown[]): Promise<unknown>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}

export interface Database extends DatabaseConnection {
  withExclusiveTransactionAsync(task: (transaction: DatabaseConnection) => Promise<void>): Promise<void>;
}
