import { createContext, useContext, type ReactNode } from 'react';
import { inflate, type WebviewStrings, type WebviewStringsDTO } from '@shared/strings';

const StringsContext = createContext<WebviewStrings | null>(null);

export function StringsProvider({
  dto,
  children,
}: {
  dto: WebviewStringsDTO;
  children: ReactNode;
}): JSX.Element {
  return <StringsContext.Provider value={inflate(dto)}>{children}</StringsContext.Provider>;
}

export function useStrings(): WebviewStrings {
  const v = useContext(StringsContext);
  if (!v) throw new Error('useStrings called outside StringsProvider');
  return v;
}
