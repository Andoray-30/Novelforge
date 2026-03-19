'use client'

import * as React from 'react'
import { useFormContext, Controller, type FieldValues, type Path } from 'react-hook-form'
import { Input } from './input'
import { Textarea } from './textarea'
import { Select } from './select'

// Form component that provides form context
interface FormProps<T extends FieldValues> {
  children: React.ReactNode
  onSubmit: (data: T) => void
  className?: string
  title?: string
  description?: string
  submitLabel?: string
  enableAutoSave?: boolean
  autoSaveIndicator?: boolean
  errorSummary?: boolean
}

export function Form<T extends FieldValues>({
  children,
  onSubmit,
  className = '',
  title,
  description,
  submitLabel = 'Submit',
  ...props
}: FormProps<T>) {
  const { handleSubmit } = useFormContext<T>()
  
  return (
    <form 
      onSubmit={handleSubmit(onSubmit)} 
      className={className}
      noValidate
    >
      {title && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          {description && <p className="text-gray-600">{description}</p>}
        </div>
      )}
      {children}
    </form>
  )
}

// FormInput component
interface FormInputProps<T extends FieldValues> {
  name: Path<T>
  label?: string
  placeholder?: string
  required?: boolean
  helpText?: string
  className?: string
  [key: string]: any
}

export function FormInput<T extends FieldValues>({
  name,
  label,
  placeholder,
  required,
  helpText,
  className = '',
  ...props
}: FormInputProps<T>) {
  const { control } = useFormContext<T>()
  
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => (
          <>
            <Input
              {...field}
              {...props}
              placeholder={placeholder}
              className={className}
            />
            {fieldState.error && (
              <p className="text-sm text-red-600">{fieldState.error.message}</p>
            )}
            {helpText && !fieldState.error && (
              <p className="text-sm text-gray-500">{helpText}</p>
            )}
          </>
        )}
      />
    </div>
  )
}

// FormTextarea component
interface FormTextareaProps<T extends FieldValues> {
  name: Path<T>
  label?: string
  placeholder?: string
  required?: boolean
  helpText?: string
  className?: string
  rows?: number
  maxLength?: number
  showCharacterCount?: boolean
  [key: string]: any
}

export function FormTextarea<T extends FieldValues>({
  name,
  label,
  placeholder,
  required,
  helpText,
  className = '',
  rows = 4,
  maxLength,
  showCharacterCount = false,
  ...props
}: FormTextareaProps<T>) {
  const { control, watch } = useFormContext<T>()
  const value = watch(name) as string || ''
  
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => (
          <>
            <Textarea
              {...field}
              {...props}
              placeholder={placeholder}
              rows={rows}
              maxLength={maxLength}
              className={className}
            />
            {(showCharacterCount || maxLength) && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>{helpText}</span>
                <span>{value.length}{maxLength ? `/${maxLength}` : ''}</span>
              </div>
            )}
            {fieldState.error && (
              <p className="text-sm text-red-600">{fieldState.error.message}</p>
            )}
            {helpText && !fieldState.error && !showCharacterCount && !maxLength && (
              <p className="text-sm text-gray-500">{helpText}</p>
            )}
          </>
        )}
      />
    </div>
  )
}

// FormSelect component
interface FormSelectProps<T extends FieldValues> {
  name: Path<T>
  label?: string
  placeholder?: string
  required?: boolean
  helpText?: string
  className?: string
  children: React.ReactNode
  [key: string]: any
}

export function FormSelect<T extends FieldValues>({
  name,
  label,
  placeholder,
  required,
  helpText,
  className = '',
  children,
  ...props
}: FormSelectProps<T>) {
  const { control } = useFormContext<T>()
  
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <Controller
        name={name}
        control={control}
        render={({ field, fieldState }) => (
          <>
            <Select
              {...field}
              {...props}
            >
              {children}
            </Select>
            {fieldState.error && (
              <p className="text-sm text-red-600">{fieldState.error.message}</p>
            )}
            {helpText && !fieldState.error && (
              <p className="text-sm text-gray-500">{helpText}</p>
            )}
          </>
        )}
      />
    </div>
  )
}