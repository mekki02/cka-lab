import { createContext, useContext } from 'react';

/**
 * Lets any code block on a page send text to the lab terminal on the same
 * page ("Run in terminal"). Null when the page has no live terminal, in
 * which case code blocks only offer "Copy".
 */
export interface TerminalBridge {
  paste: (text: string) => void;
}

export const TerminalBridgeContext = createContext<TerminalBridge | null>(null);
export const useTerminalBridge = () => useContext(TerminalBridgeContext);

/** True while the playground dock takes part of the screen: wide layouts should collapse. */
export const TerminalDockOpenContext = createContext(false);
export const useTerminalDockOpen = () => useContext(TerminalDockOpenContext);
