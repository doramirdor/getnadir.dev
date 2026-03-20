import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Brain, Zap, Settings, Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";

interface PromptUpload {
  id: string;
  file_name: string;
  total_prompts: number;
  status: string;
}

interface WarmupConfig {
  algorithm: 'semantic' | 'keyword' | 'hybrid';
  min_cluster_size: number;
  max_clusters: number;
  similarity_threshold: number;
  include_examples: boolean;
  generate_criteria: boolean;
}

interface ClusterWarmupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  upload: PromptUpload | null;
  onWarmupStarted?: () => void;
}

export const ClusterWarmupDialog = ({ open, onOpenChange, upload, onWarmupStarted }: ClusterWarmupDialogProps) => {
  const [warmupName, setWarmupName] = useState("");
  const [config, setConfig] = useState<WarmupConfig>({
    algorithm: 'hybrid',
    min_cluster_size: 5,
    max_clusters: 20,
    similarity_threshold: 0.7,
    include_examples: true,
    generate_criteria: true
  });
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && upload) {
      setWarmupName(`${upload.file_name.replace('.csv', '')}_clusters`);
    }
  }, [open, upload]);

  const handleStartWarmup = async () => {
    if (!upload || !warmupName.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Warmup name is required"
      });
      return;
    }

    setStarting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create warmup job
      const { data: warmupJob, error: warmupError } = await supabase
        .from('cluster_warmups')
        .insert({
          user_id: user.id,
          upload_id: upload.id,
          warmup_name: warmupName,
          status: 'pending',
          total_clusters_expected: config.max_clusters,
          warmup_config: config
        })
        .select()
        .single();

      if (warmupError) throw warmupError;

      // In a real implementation, this would trigger a background job
      // For now, we'll simulate the clustering process
      await simulateClusterGeneration(warmupJob.id, upload.id, user.id);

      toast({
        title: "Cluster Warmup Started",
        description: `Clustering process initiated for ${upload.file_name}. This may take a few minutes.`
      });

      onOpenChange(false);
      
      if (onWarmupStarted) {
        onWarmupStarted();
      }

      // Reset form
      setWarmupName("");

    } catch (error: unknown) {
      logger.error('Warmup error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to start cluster warmup";
      toast({
        variant: "destructive",
        title: "Warmup Failed",
        description: errorMessage
      });
    } finally {
      setStarting(false);
    }
  };

  // Simulate cluster generation (in production, this would be a background job)
  const simulateClusterGeneration = async (warmupId: string, uploadId: string, userId: string) => {
    // Update warmup status to running
    await supabase
      .from('cluster_warmups')
      .update({ 
        status: 'running',
        started_at: new Date().toISOString()
      })
      .eq('id', warmupId);

    // Create sample clusters based on the example provided
    const sampleClusters = [
      {
        cluster_name: "Landing_Page_Marketing",
        description: "Single-screen (or short-scroll) marketing pages that promote a product, SaaS, startup or campaign and drive visitors to one clear call-to-action.",
        usage_examples: [
          "Tech Landing Page",
          "Smart Home Landing Page", 
          "Web3 Landing Page"
        ],
        classification_criteria: [
          "Title or prompt contains marketing hints such as 'landing page', 'hero section', 'home page', 'startup', 'SaaS', 'launch', 'CTA', 'coming-soon'.",
          "Focus is persuasion & sign-up, not long-form content or e-commerce checkout.",
          "Structure is typically one scrollable page with sections like features, testimonials, pricing, CTA."
        ]
      },
      {
        cluster_name: "Portfolio_Personal_Showcase", 
        description: "Sites meant to showcase a person's or studio's work (design, photography, art, engineering) with galleries, case studies or résumé-style sections.",
        usage_examples: [
          "Graphic Designer Portfolio Site",
          "Art Portfolio",
          "UX Portfolio Pages"
        ],
        classification_criteria: [
          "Key words: 'portfolio', 'resume', 'CV', 'case study', 'gallery'.",
          "Main purpose is to present projects / artworks, not sell them (no cart / checkout).",
          "Includes project thumbnails, project detail pages, 'About me' or résumé sections."
        ]
      },
      {
        cluster_name: "Blog_Content_Platform",
        description: "Templates for blogs, newsletters or magazine-style sites that list multiple posts and allow reading individual articles.",
        usage_examples: [
          "CodeBlog with Algolia Search",
          "Outdoor Adventure Blog", 
          "Minimal Serif Blog"
        ],
        classification_criteria: [
          "Contains words like 'blog', 'newsletter', 'posts', 'articles'.",
          "Includes post list / feed, tags or categories, and single-post pages.",
          "Goal is publishing & reading content, not pure marketing or portfolio display."
        ]
      }
    ];

    // Insert clusters
    for (const cluster of sampleClusters) {
      await supabase
        .from('prompt_clusters')
        .insert({
          user_id: userId,
          upload_id: uploadId,
          cluster_name: cluster.cluster_name,
          description: cluster.description,
          usage_examples: cluster.usage_examples,
          classification_criteria: cluster.classification_criteria,
          prompt_count: Math.floor(Math.random() * 50) + 10 // Random count for demo
        });
    }

    // Update warmup status to completed
    await supabase
      .from('cluster_warmups')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        clusters_generated: sampleClusters.length
      })
      .eq('id', warmupId);

    // Update upload status to clustered
    await supabase
      .from('prompt_uploads')
      .update({ status: 'clustered' })
      .eq('id', uploadId);
  };

  const getEstimatedTime = () => {
    if (!upload) return "Unknown";
    const prompts = upload.total_prompts;
    if (prompts < 100) return "1-2 minutes";
    if (prompts < 500) return "2-5 minutes";
    if (prompts < 1000) return "5-10 minutes";
    return "10-20 minutes";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            Cluster Warmup Configuration
          </DialogTitle>
          <DialogDescription>
            Configure the clustering algorithm to automatically organize your prompts into meaningful groups.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Info */}
          {upload && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <strong>{upload.file_name}</strong> • {upload.total_prompts} prompts
                  </div>
                  <Badge variant="outline">
                    Est. {getEstimatedTime()}
                  </Badge>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Warmup Name */}
          <div>
            <Label htmlFor="warmup-name">Warmup Name</Label>
            <Input
              id="warmup-name"
              value={warmupName}
              onChange={(e) => setWarmupName(e.target.value)}
              placeholder="my_prompt_clusters"
              className="mt-1"
            />
          </div>

          {/* Algorithm Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Algorithm Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Clustering Algorithm */}
              <div>
                <Label>Clustering Algorithm</Label>
                <Select 
                  value={config.algorithm} 
                  onValueChange={(value: 'semantic' | 'keyword' | 'hybrid') => 
                    setConfig(prev => ({ ...prev, algorithm: value }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semantic">
                      <div>
                        <div className="font-medium">Semantic Clustering</div>
                        <div className="text-xs text-gray-600">Groups by meaning and context</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="keyword">
                      <div>
                        <div className="font-medium">Keyword Clustering</div>
                        <div className="text-xs text-gray-600">Groups by common keywords</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="hybrid">
                      <div>
                        <div className="font-medium">Hybrid Clustering (Recommended)</div>
                        <div className="text-xs text-gray-600">Combines semantic and keyword analysis</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Cluster Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Cluster Size</Label>
                  <div className="mt-2">
                    <Slider
                      value={[config.min_cluster_size]}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, min_cluster_size: value[0] }))}
                      min={3}
                      max={20}
                      step={1}
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>3</span>
                      <span>{config.min_cluster_size}</span>
                      <span>20</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Max Clusters</Label>
                  <div className="mt-2">
                    <Slider
                      value={[config.max_clusters]}
                      onValueChange={(value) => setConfig(prev => ({ ...prev, max_clusters: value[0] }))}
                      min={5}
                      max={50}
                      step={1}
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>5</span>
                      <span>{config.max_clusters}</span>
                      <span>50</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Similarity Threshold */}
              <div>
                <Label>Similarity Threshold</Label>
                <div className="mt-2">
                  <Slider
                    value={[config.similarity_threshold * 100]}
                    onValueChange={(value) => setConfig(prev => ({ ...prev, similarity_threshold: value[0] / 100 }))}
                    min={50}
                    max={95}
                    step={5}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>50%</span>
                    <span>{Math.round(config.similarity_threshold * 100)}%</span>
                    <span>95%</span>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Higher values create more specific clusters, lower values create broader groups
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Generated Features
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Generate Usage Examples</Label>
                  <p className="text-xs text-gray-600">Create example use cases for each cluster</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.include_examples}
                  onChange={(e) => setConfig(prev => ({ ...prev, include_examples: e.target.checked }))}
                  className="rounded"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Generate Classification Criteria</Label>
                  <p className="text-xs text-gray-600">Create rules for classifying prompts into clusters</p>
                </div>
                <input
                  type="checkbox"
                  checked={config.generate_criteria}
                  onChange={(e) => setConfig(prev => ({ ...prev, generate_criteria: e.target.checked }))}
                  className="rounded"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleStartWarmup}
            disabled={starting || !warmupName.trim()}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {starting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting Warmup...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Start Cluster Warmup
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};