import 'react'

declare module 'react' {
  interface InputHTMLAttributes<T> extends React.AriaAttributes, React.DOMAttributes<T> {
    webkitdirectory?: string | boolean
    directory?: string | boolean
  }
}
