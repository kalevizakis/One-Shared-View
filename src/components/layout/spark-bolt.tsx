import React from "react"

/**
 * The Spark bolt, taken from the official Spark Build lockup.
 * Uses currentColor so it works on any background and theme.
 */
export const SparkBolt: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="34.27 54.07 227.09 227.09"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path d="M226.33,167.34c-1.4-3.48-4.73-5.73-8.49-5.73h-61.44l35.31-95.19c1.49-4.02.03-8.48-3.56-10.84-3.59-2.36-8.26-1.92-11.36,1.05l-105.34,101.22c-2.71,2.6-3.55,6.53-2.15,10.02s4.73,5.73,8.49,5.73h61.37l-35.25,95.22c-1.49,4.03-.02,8.48,3.57,10.83,1.54,1.01,3.29,1.51,5.02,1.51,2.29,0,4.57-.87,6.33-2.56l105.35-101.24c2.71-2.6,3.55-6.53,2.15-10.02ZM176.13,73.91l-32.53,87.7h-58.74l91.27-87.7ZM119.47,261.34l32.48-87.73h58.82l-91.3,87.73Z" />
  </svg>
)
