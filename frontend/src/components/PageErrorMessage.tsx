type PageErrorMessageProps = {
  message: string;
};

export function PageErrorMessage({ message }: PageErrorMessageProps) {
  return <div className="border border-bnb-red/30 bg-bnb-red/10 p-4 text-bnb-red">{message}</div>;
}
