import { describe, it, expect } from "vitest";
import { renderWithProviders } from "@/test/test-utils";

// Import all current pages (not lazy) for smoke testing
import Analytics from "../Analytics";
import ApiKeys from "../ApiKeys";
import Billing from "../Billing";
import FAQ from "../FAQ";
import IntegrationsBYOK from "../IntegrationsBYOK";
import Logs from "../Logs";
import NotFound from "../NotFound";
import Onboarding from "../Onboarding";
import Pricing from "../Pricing";
import Savings from "../Savings";
import Settings from "../Settings";
import Support from "../Support";

const pages = [
  { name: "Analytics", Component: Analytics },
  { name: "ApiKeys", Component: ApiKeys },
  { name: "Billing", Component: Billing },
  { name: "FAQ", Component: FAQ },
  { name: "IntegrationsBYOK", Component: IntegrationsBYOK },
  { name: "Logs", Component: Logs },
  { name: "NotFound", Component: NotFound },
  { name: "Onboarding", Component: Onboarding },
  { name: "Pricing", Component: Pricing },
  { name: "Savings", Component: Savings },
  { name: "Settings", Component: Settings },
  { name: "Support", Component: Support },
];

describe("Page smoke tests", () => {
  pages.forEach(({ name, Component }) => {
    it(`${name} renders without crashing`, () => {
      const { container } = renderWithProviders(<Component />);
      expect(container).toBeTruthy();
    });
  });
});
