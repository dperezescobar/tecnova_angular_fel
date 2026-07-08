declare module '@webdatarocks/webdatarocks' {
  interface WDRConfig {
    container: string | HTMLElement;
    toolbar?: boolean;
    width?: string | number;
    height?: string | number;
    report?: object;
    reportcomplete?: () => void;
    [key: string]: unknown;
  }
  class WebDataRocks {
    constructor(config: WDRConfig);
    setReport(report: object): void;
    updateData(options: { data: object[] }): void;
    expandAllData(): void;
    dispose(): void;
    on(event: string, handler: (data: unknown) => void): void;
    off(event: string, handler?: () => void): void;
  }
  export default WebDataRocks;
}
