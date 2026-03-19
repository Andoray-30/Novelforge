import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helpText?: string
  required?: boolean
  autoResize?: boolean
  maxLength?: number
  showCharacterCount?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ 
    className, 
    label, 
    error, 
    helpText, 
    required, 
    autoResize = false,
    maxLength,
    showCharacterCount = false,
    value,
    onChange,
    ...props 
  }, ref) => {
    const textareaId = React.useId()
    const textareaRef = React.useRef<HTMLTextAreaElement>(null)
    const [currentLength, setCurrentLength] = React.useState(0)

    // 自动调整高度
    const adjustHeight = React.useCallback(() => {
      if (autoResize && textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
      }
    }, [autoResize])

    // 处理文本变化
    const handleChange = React.useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (maxLength && e.target.value.length > maxLength) {
        return
      }
      
      setCurrentLength(e.target.value.length)
      adjustHeight()
      onChange?.(e)
    }, [maxLength, onChange, adjustHeight])

    // 初始化字符计数
    React.useEffect(() => {
      if (typeof value === 'string') {
        setCurrentLength(value.length)
      }
    }, [value])

    // 自动调整初始高度
    React.useEffect(() => {
      adjustHeight()
    }, [adjustHeight])

    // 合并ref
    React.useImperativeHandle(ref, () => textareaRef.current!, [])

    return (
      <div className="w-full space-y-2">
        {label && (
          <label 
            htmlFor={textareaId} 
            className={cn(
              "block text-sm font-medium",
              error ? "text-red-700" : "text-gray-700"
            )}
          >
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
        
        <div className="relative">
          <textarea
            id={textareaId}
            className={cn(
              "flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
              autoResize && "resize-none overflow-hidden",
              error && "border-red-500 focus-visible:ring-red-500",
              className
            )}
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            maxLength={maxLength}
            {...props}
          />
        </div>
        
        <div className="flex justify-between items-center">
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          
          {helpText && !error && (
            <p className="text-sm text-gray-500">{helpText}</p>
          )}
          
          {showCharacterCount && maxLength && (
            <p className={cn(
              "text-sm ml-auto",
              currentLength > maxLength * 0.9 ? "text-red-600" : "text-gray-500"
            )}>
              {currentLength}/{maxLength}
            </p>
          )}
        </div>
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }