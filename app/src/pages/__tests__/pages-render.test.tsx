import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/test-utils";

// Import pages directly (not lazy) for unit testing
import Analytics from "../Analytics";
import ApiKeys from "../ApiKeys";
import Presets from "../Presets";
import Clustering from "../Clustering";
import Configuration from "../Configuration";
import Providers from "../Providers";
import Users from "../Users";
import Billing from "../Billing";
import Logs from "../Logs";
import Settings from "../Settings";
import Playground from "../Playground";
import IntegrationsBYOK from "../IntegrationsBYOK";
import SmartExport from "../SmartExport";
import Organization from "../Organization";
import Onboarding from "../Onboarding";
import NotFound from "../NotFound";

const pages = [
  { name: "Analytics", Component: Analytics },
  { name: "ApiKeys", Component: ApiKeys },
  { name: "Presets", Component: Presets },
  { name: "Clustering", Component: Clustering },
  { name: "Configuration", Component: Configuration },
  { name: "Providers", Component: Providers },
  { name: "Users", Component: Users },
  { name: "Billing", Component: Billing },
  { name: "Logs", Component: Logs },
  { name: "Settings", Component: Settings },
  { name: "Playground", Component: Playground },
  { name: "IntegrationsBYOK", Component: IntegrationsBYOK },
  { name: "SmartExport", Component: SmartExport },
  { name: "Organization", Component: Organization },
  { name: "Onboarding", Component: Onboarding },
  { name: "NotFound", Component: NotFound },
];

describe("Page smoke tests", () => {
  pages.forEach(({ name, Component }) => {
    it(`${name} renders without crashing`, () => {
      const { container } = renderWithProviders(<Component />);
      expect(container).toBeTruthy();
    });
  });
});
