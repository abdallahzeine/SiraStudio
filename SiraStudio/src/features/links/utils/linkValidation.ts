import type { IconType } from "../../../shared/types";
import { detectIconTypeFromUrl } from "../icons";

export interface ValidationResult {
  isValid: boolean;
  error: string | null;
  normalizedUrl: string;
  detectedIcon: IconType;
}

export const validateUrl = (input: string): ValidationResult => {
  // Empty check
  if (!input || input.trim() === "") {
    return {
      isValid: false,
      error: "URL is required",
      normalizedUrl: "",
      detectedIcon: "globe",
    };
  }

  let url = input.trim();

  // Handle email links
  if (url.startsWith("mailto:")) {
    const emailPart = url.slice(7);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValidEmail = emailRegex.test(emailPart);

    return {
      isValid: isValidEmail,
      error: isValidEmail ? null : "Invalid email address",
      normalizedUrl: url,
      detectedIcon: "mail",
    };
  }

  // Handle phone links
  if (url.startsWith("tel:")) {
    const phonePart = url.slice(4);
    // Basic phone validation - allows various formats
    const isValidPhone =
      phonePart.length >= 7 && /^[\d\s+\-().]+$/.test(phonePart);

    return {
      isValid: isValidPhone,
      error: isValidPhone ? null : "Invalid phone number",
      normalizedUrl: url,
      detectedIcon: "phone",
    };
  }

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  try {
    const urlObj = new URL(url);

    // Check for valid protocol
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return {
        isValid: false,
        error: "URL must use HTTP or HTTPS protocol",
        normalizedUrl: url,
        detectedIcon: detectIconTypeFromUrl(url),
      };
    }

    // Check for valid hostname
    if (!urlObj.hostname || urlObj.hostname.length < 3) {
      return {
        isValid: false,
        error: "Invalid domain name",
        normalizedUrl: url,
        detectedIcon: detectIconTypeFromUrl(url),
      };
    }

    // Check for spaces in URL
    if (url.includes(" ")) {
      return {
        isValid: false,
        error: "URL cannot contain spaces",
        normalizedUrl: url,
        detectedIcon: detectIconTypeFromUrl(url),
      };
    }

    return {
      isValid: true,
      error: null,
      normalizedUrl: url,
      detectedIcon: detectIconTypeFromUrl(url),
    };
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format",
      normalizedUrl: url,
      detectedIcon: "globe",
    };
  }
};

const normalizeUrl = (input: string): string => {
  if (!input) return "";

  let url = input.trim();

  // Don't modify mailto: or tel: links
  if (url.startsWith("mailto:") || url.startsWith("tel:")) {
    return url;
  }

  // Add protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  return url;
};

export const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(normalizeUrl(url));
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
