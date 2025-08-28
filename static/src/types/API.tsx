export interface APIError {
  statusCode: number;
  statusText: string;
  retry: boolean;
}
