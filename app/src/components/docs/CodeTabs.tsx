import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./CodeBlock";

interface CodeExample {
  label: string;
  language: string;
  code: string;
}

export const CodeTabs = ({ examples }: { examples: CodeExample[] }) => {
  if (examples.length === 0) return null;

  return (
    <Tabs defaultValue={examples[0].language} className="w-full">
      <TabsList className="w-full justify-start rounded-b-none border border-border bg-muted/50">
        {examples.map((ex) => (
          <TabsTrigger
            key={ex.language}
            value={ex.language}
            className="text-xs data-[state=active]:bg-background"
          >
            {ex.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {examples.map((ex) => (
        <TabsContent key={ex.language} value={ex.language} className="mt-0">
          <div className="-mt-[1px]">
            <CodeBlock>{ex.code}</CodeBlock>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
};
