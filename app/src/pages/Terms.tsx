import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { SEO } from "@/components/SEO";

export default function Terms() {
  const navigate = useNavigate();

  return (
    <MarketingLayout>
      <SEO title="Terms of Service - Nadir" description="Terms of service for Nadir Tech LLC." path="/terms" />
      <div className="container mx-auto px-6 py-8 max-w-3xl">
        <Button
          variant="ghost"
          className="mb-8 hover:bg-muted"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>

        <h1 className="text-4xl font-semibold text-foreground mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Last updated: April 12, 2026
        </p>

        <div className="prose prose-neutral max-w-none space-y-8 text-muted-foreground leading-relaxed">
          <section className="space-y-3">
            <p>
              These Terms of Service ("Terms") govern your access to and use of the Nadir platform operated by Nadir Tech LLC ("Nadir," "we," "us," or "our"). By creating an account or using the service, you agree to be bound by these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">1. Eligibility</h2>
            <p>
              You must be at least 18 years old and capable of entering into a legally binding agreement to use Nadir. By using the service, you represent and warrant that you meet these requirements.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">2. Service Description</h2>
            <p>
              Nadir provides an intelligent LLM routing gateway that analyzes prompt complexity and routes requests to third-party language model providers on your behalf. We do not guarantee the accuracy, availability, or performance of any upstream provider. The service is provided on an "as is" and "as available" basis.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">3. Account Responsibilities</h2>
            <p>
              You are responsible for safeguarding your API keys and account credentials, and for all activity that occurs under your account. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide accurate and complete registration information</li>
              <li>Keep your credentials confidential and not share API keys publicly</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
              <li>Not use the service for any unlawful, harmful, or abusive purpose</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">4. Acceptable Use</h2>
            <p>
              You agree not to use Nadir to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Violate any applicable laws or regulations</li>
              <li>Generate or distribute harmful, abusive, or illegal content</li>
              <li>Attempt to gain unauthorized access to our systems or other users' accounts</li>
              <li>Interfere with or disrupt the integrity or performance of the service</li>
              <li>Reverse engineer, decompile, or disassemble any part of the service</li>
              <li>Resell or redistribute the service without our written consent</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">5. Usage &amp; Billing</h2>
            <p>
              Usage is metered based on tokens processed and routing fees. Current pricing is displayed on the Billing page of your dashboard. We reserve the right to update pricing with 30 days' prior notice. You are responsible for all charges incurred under your account.
            </p>
            <p>
              Payment processing is handled by Stripe. By providing payment information, you agree to Stripe's terms of service. Charges are billed according to your selected plan. Refunds are issued at our sole discretion.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">6. Intellectual Property</h2>
            <p>
              The Nadir platform, including its software, design, and documentation, is the property of Nadir Tech LLC and is protected by intellectual property laws. You retain ownership of any content you submit through the service. By using the service, you grant us a limited license to process your content solely for the purpose of providing the service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">7. Privacy</h2>
            <p>
              Your use of the service is also governed by our <a href="/privacy" className="text-foreground underline hover:no-underline">Privacy Policy</a>, which describes how we collect, use, and protect your information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">8. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">9. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, NADIR TECH LLC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE, INCLUDING BUT NOT LIMITED TO LOSS OF DATA, REVENUE, OR PROFITS, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNTS PAID BY YOU TO US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">10. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Nadir Tech LLC and its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including reasonable attorney's fees) arising from your use of the service or violation of these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">11. Termination</h2>
            <p>
              We may suspend or terminate your account if you violate these Terms or for any other reason at our sole discretion with reasonable notice. You may delete your account at any time from the Settings page. Upon termination, your right to use the service ceases immediately. Sections that by their nature should survive termination will survive.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">12. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions. Any disputes shall be resolved in the state or federal courts located in Delaware.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes by posting the updated Terms on this page and updating the "Last updated" date. Your continued use of the service after changes constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section id="promotions" className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">14. Promotional Offers</h2>
            <p>
              From time to time, Nadir may offer promotional pricing, discount codes, or other special offers ("Promotions"). All Promotions are subject to the following conditions:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Nadir reserves the right to modify, suspend, or discontinue any Promotion at any time, at its sole discretion, without prior notice.</li>
              <li>Promotions are limited to one per account unless otherwise stated.</li>
              <li>Promotional codes cannot be combined with other offers, discounts, or credits.</li>
              <li>After the promotional period ends, standard pricing applies automatically. You will be charged the then-current subscription rate unless you cancel before the promotional period expires.</li>
              <li>Promotions are non-transferable and have no cash value.</li>
              <li>Abuse or fraudulent use of promotional codes may result in account suspension or termination.</li>
            </ul>
          </section>

          <section id="data-deletion" className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">15. Data Deletion &amp; Your Privacy Rights</h2>
            <p>
              You have the right to delete your account and all associated data at any time from the Settings page of your dashboard. Account deletion is permanent and irreversible.
            </p>
            <p>
              When you delete your account, we will:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Cancel any active subscription immediately</li>
              <li>Delete your payment methods and billing information from Stripe</li>
              <li>Delete all usage logs, savings tracking data, and invoice records</li>
              <li>Delete all API keys and provider credentials</li>
              <li>Delete your profile and personal information</li>
              <li>Delete your authentication account</li>
            </ul>
            <p>
              If you have an active subscription with outstanding savings fees at the time of deletion, those fees will be charged to your payment method before deletion is completed.
            </p>
            <p>
              <strong className="text-foreground">GDPR (EU/EEA residents):</strong> You have the right to access, rectify, and erase your personal data under Articles 15-17 of the General Data Protection Regulation. You may also request data portability or object to processing. Contact us at <strong className="text-foreground">info@getnadir.com</strong> for these requests.
            </p>
            <p>
              <strong className="text-foreground">CCPA (California residents):</strong> Under the California Consumer Privacy Act, you have the right to know what personal information we collect, to delete your personal information, and to opt out of the sale of your personal information. We do not sell personal information. You may exercise your deletion rights through the Settings page or by contacting <strong className="text-foreground">info@getnadir.com</strong>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-foreground">16. Contact</h2>
            <p>
              Questions about these Terms can be directed to <strong className="text-foreground">info@getnadir.com</strong>.
            </p>
            <p className="text-sm">
              Nadir Tech LLC
            </p>
          </section>
        </div>
      </div>
    </MarketingLayout>
  );
}
