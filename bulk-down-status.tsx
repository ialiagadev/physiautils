"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { ChevronDown, Check, FileText, AlertTriangle, HelpCircle, Settings, Shield, Clock } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { generateUniqueInvoiceNumber } from "@/lib/invoice-utils"

type InvoiceStatus = "draft" | "issued"

interface BulkStatusSelectorProps {
  selectedInvoiceIds: number[]
  onStatusChanged?: () => void
  disabled?: boolean
}

interface InvoiceStatusInfo {
  id: number
  invoice_number: string
  status: InvoiceStatus
  organization_id: number
  invoice_type: string
}

const statusConfig: Record<
  InvoiceStatus,
  {
    label: string
    color: string
    icon: any
    description: string
  }
> = {
  draft: {
    label: "Borrador",
    color: "bg-gray-100 text-gray-800 border-gray-200",
    icon: FileText,
    description: "Factura en borrador, no válida fiscalmente",
  },
  issued: {
    label: "Emitida",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icon: Check,
    description: "Factura emitida",
  },
}

export function BulkStatusSelector({ selectedInvoiceIds, onStatusChanged, disabled = false }: BulkStatusSelectorProps) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showEmissionDialog, setShowEmissionDialog] = useState(false)
  const [selectedNewStatus, setSelectedNewStatus] = useState<InvoiceStatus | null>(null)
  const [invoicesInfo, setInvoicesInfo] = useState<InvoiceStatusInfo[]>([])
  const [applicableInvoices, setApplicableInvoices] = useState<InvoiceStatusInfo[]>([])
  const [nonApplicableInvoices, setNonApplicableInvoices] = useState<InvoiceStatusInfo[]>([])
  const [availableStatuses, setAvailableStatuses] = useState<InvoiceStatus[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [processingProgress, setProcessingProgress] = useState<{
    current: number
    total: number
    currentInvoice: string
    successCount: number
    errorCount: number
  }>({ current: 0, total: 0, currentInvoice: "", successCount: 0, errorCount: 0 })

  const { toast } = useToast()

  const getStatusConfig = (status: string) => {
    return (
      statusConfig[status as InvoiceStatus] || {
        label: "Estado desconocido",
        color: "bg-gray-100 text-gray-800 border-gray-200",
        icon: HelpCircle,
        description: "Estado no reconocido",
      }
    )
  }

  const isValidStatusTransition = (from: InvoiceStatus, to: InvoiceStatus): boolean => {
    const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
      draft: ["issued"],
      issued: [], // No hay transiciones desde issued
    }
    return validTransitions[from]?.includes(to) || false
  }

  const getCommonAvailableStatuses = (invoices: InvoiceStatusInfo[]): InvoiceStatus[] => {
    if (!Array.isArray(invoices) || invoices.length === 0) return []

    const availableStatusesPerInvoice = invoices.map((invoice) => {
      const validTransitions: Record<InvoiceStatus, InvoiceStatus[]> = {
        draft: ["issued"],
        issued: [], // No hay transiciones desde issued
      }
      return validTransitions[invoice.status] || []
    })

    if (availableStatusesPerInvoice.length === 0) return []

    return availableStatusesPerInvoice.reduce((common, current) => common.filter((status) => current.includes(status)))
  }

  const loadAvailableStatuses = async () => {
    if (!Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0) {
      setAvailableStatuses([])
      setInvoicesInfo([])
      return
    }

    try {
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, organization_id, invoice_type")
        .in("id", selectedInvoiceIds)

      if (error) {
        console.error("Error loading invoice statuses:", error)
        setAvailableStatuses([])
        setInvoicesInfo([])
        return
      }

      const invoicesData = (invoices || []) as InvoiceStatusInfo[]
      setInvoicesInfo(invoicesData)

      const commonStatuses = getCommonAvailableStatuses(invoicesData)
      setAvailableStatuses(commonStatuses)
    } catch (error) {
      console.error("Error loading available statuses:", error)
      setAvailableStatuses([])
      setInvoicesInfo([])
    }
  }

  useEffect(() => {
    loadAvailableStatuses()
  }, [selectedInvoiceIds])

  // ✅ FUNCIÓN PRINCIPAL CORREGIDA - ASEGURAR QUE EL NÚMERO ESTÉ ASIGNADO
  const performBulkStatusChange = async (invoices: InvoiceStatusInfo[], newStatus: InvoiceStatus) => {
    if (!Array.isArray(invoices) || invoices.length === 0 || !newStatus) {
      resetAllStates()
      return
    }

    setIsUpdating(true)
    try {
      const invoiceIds = invoices.map((inv) => inv.id).filter((id) => id)
      if (invoiceIds.length === 0) {
        throw new Error("No hay facturas válidas para actualizar")
      }

      const isDraftToIssued = newStatus === "issued"
      const draftInvoices = invoices.filter((inv) => inv && inv.status === "draft")
      const nonDraftInvoices = invoices.filter((inv) => inv && inv.status !== "draft")

      // ✅ INICIALIZAR PROGRESO
      if (isDraftToIssued && draftInvoices.length > 0) {
        let successCount = 0
        let errorCount = 0
        const processedInvoices: string[] = []
        const failedInvoices: string[] = []
        const totalToProcess = draftInvoices.length + nonDraftInvoices.length

        setProcessingProgress({
          current: 0,
          total: totalToProcess,
          currentInvoice: "",
          successCount: 0,
          errorCount: 0,
        })

        for (let i = 0; i < draftInvoices.length; i++) {
          const invoice = draftInvoices[i]
          let invoiceNumberFormatted = ""
          let newInvoiceNumber = 0
          let fieldName = ""

          try {
            // ✅ ACTUALIZAR PROGRESO - FACTURA ACTUAL (SIN ID)
            setProcessingProgress((prev) => ({
              ...prev,
              current: i + 1,
              currentInvoice: `Procesando factura ${i + 1} de ${draftInvoices.length}`,
            }))

            console.log(
              `🔄 Procesando factura ${invoice.id} (${invoice.invoice_type})... [${i + 1}/${draftInvoices.length}]`,
            )

            // ✅ GENERAR Y ASIGNAR NÚMERO DE FACTURA
            const numberResult = await generateUniqueInvoiceNumber(invoice.organization_id, invoice.invoice_type as any)
            invoiceNumberFormatted = numberResult.invoiceNumberFormatted
            newInvoiceNumber = numberResult.newInvoiceNumber

            // ✅ ACTUALIZAR CONTADOR EN ORGANIZACIÓN
            const getFieldNameForUpdate = (type: string): string => {
              switch (type) {
                case "rectificativa":
                  return "last_rectificative_invoice_number"
                case "simplificada":
                  return "last_simplified_invoice_number"
                case "normal":
                default:
                  return "last_invoice_number"
              }
            }

            fieldName = getFieldNameForUpdate(invoice.invoice_type)
            const { error: updateOrgError } = await supabase
              .from("organizations")
              .update({ [fieldName]: newInvoiceNumber })
              .eq("id", invoice.organization_id)

            if (updateOrgError) {
              console.error("Error updating organization:", updateOrgError)
              throw new Error("Error al reservar el número de factura")
            }

            // ✅ ACTUALIZAR FACTURA CON NÚMERO Y ESTADO
            const { error: dbError } = await supabase
              .from("invoices")
              .update({
                status: newStatus,
                invoice_number: invoiceNumberFormatted,
                validated_at: new Date().toISOString(),
              })
              .eq("id", invoice.id)

            if (dbError) {
              throw new Error(`Error al actualizar el estado: ${dbError.message}`)
            }

            // ✅ VERIFICAR QUE LA FACTURA TENGA EL NÚMERO ASIGNADO ANTES DE VERIFACTU
            console.log(`✅ Factura ${invoice.id} actualizada con número ${invoiceNumberFormatted}`)

            // ✅ PEQUEÑA PAUSA PARA ASEGURAR CONSISTENCIA
            await new Promise((resolve) => setTimeout(resolve, 100))

            // ✅ VERIFICAR EN BASE DE DATOS QUE EL NÚMERO ESTÉ ASIGNADO
            const { data: verifyInvoice, error: verifyError } = await supabase
              .from("invoices")
              .select("invoice_number")
              .eq("id", invoice.id)
              .single()

            if (verifyError || !verifyInvoice?.invoice_number) {
              throw new Error(`La factura ${invoice.id} no tiene número asignado después de la actualización`)
            }

            console.log(`🔍 Verificado: Factura ${invoice.id} tiene número ${verifyInvoice.invoice_number}`)

            // ✅ ENVIAR A VERIFACTU SOLO SI EL NÚMERO ESTÁ CONFIRMADO
            try {
              const res = await fetch(`/api/verifactu/send-invoice?invoice_id=${invoice.id}`)
              const data = await res.json()

              if (!res.ok) {
                throw new Error(data?.error || `Error ${res.status}: ${res.statusText}`)
              }

              successCount++
              processedInvoices.push(invoiceNumberFormatted)
              setProcessingProgress((prev) => ({
                ...prev,
                successCount: successCount,
                currentInvoice: `✅ Factura ${invoiceNumberFormatted} completada`,
              }))

              console.log(
                `✅ Factura ${invoiceNumberFormatted} enviada a VeriFactu correctamente [${i + 1}/${draftInvoices.length}]`,
              )

              // ✅ PEQUEÑA PAUSA PARA MOSTRAR EL PROGRESO
              await new Promise((resolve) => setTimeout(resolve, 300))
            } catch (verifactuError) {
              console.error(`❌ Error en Verifactu para factura ${invoice.id}, haciendo rollback...`)

              // ✅ ROLLBACK COMPLETO
              await supabase
                .from("invoices")
                .update({
                  status: "draft",
                  invoice_number: null,
                  validated_at: null,
                })
                .eq("id", invoice.id)

              // ✅ ROLLBACK DEL CONTADOR
              await supabase
                .from("organizations")
                .update({ [fieldName]: newInvoiceNumber - 1 })
                .eq("id", invoice.organization_id)

              errorCount++
              failedInvoices.push(invoiceNumberFormatted)
              setProcessingProgress((prev) => ({
                ...prev,
                errorCount: errorCount,
                currentInvoice: `Procesando factura ${i + 1} de ${draftInvoices.length}`,
              }))

              // ✅ PEQUEÑA PAUSA PARA MOSTRAR EL ERROR
              await new Promise((resolve) => setTimeout(resolve, 300))
              console.log(`🔄 Rollback completado para factura ${invoice.id}`)
            }
          } catch (error) {
            console.error(`❌ Error procesando factura ${invoice.id}:`, error)

            // ✅ ROLLBACK SI HAY NÚMERO ASIGNADO
            if (invoiceNumberFormatted && newInvoiceNumber > 0 && fieldName) {
              console.log(`🔄 Haciendo rollback para factura ${invoice.id}...`)
              await supabase
                .from("invoices")
                .update({
                  status: "draft",
                  invoice_number: null,
                  validated_at: null,
                })
                .eq("id", invoice.id)

              await supabase
                .from("organizations")
                .update({ [fieldName]: newInvoiceNumber - 1 })
                .eq("id", invoice.organization_id)
            }

            errorCount++
            failedInvoices.push(invoiceNumberFormatted)
            setProcessingProgress((prev) => ({
              ...prev,
              errorCount: errorCount,
              currentInvoice: `Procesando factura ${i + 1} de ${draftInvoices.length}`,
            }))

            // ✅ PEQUEÑA PAUSA PARA MOSTRAR EL ERROR
            await new Promise((resolve) => setTimeout(resolve, 300))
          }
        }

        // ✅ PROCESAR FACTURAS NO-BORRADOR CON PROGRESO
        if (nonDraftInvoices.length > 0) {
          setProcessingProgress((prev) => ({
            ...prev,
            currentInvoice: "Finalizando proceso...",
          }))

          const nonDraftIds = nonDraftInvoices.map((inv) => inv.id)
          const { error: nonDraftError } = await supabase
            .from("invoices")
            .update({
              status: newStatus,
              validated_at: new Date().toISOString(),
            })
            .in("id", nonDraftIds)

          if (nonDraftError) {
            console.error("Error actualizando facturas no-borrador:", nonDraftError)
          } else {
            successCount += nonDraftInvoices.length
            setProcessingProgress((prev) => ({
              ...prev,
              successCount: successCount,
              current: totalToProcess,
              currentInvoice: "✅ Proceso completado",
            }))
          }
        }

        // ✅ PAUSA FINAL PARA MOSTRAR RESULTADO
        await new Promise((resolve) => setTimeout(resolve, 1500))

        // ✅ MOSTRAR RESULTADOS
        if (errorCount === 0) {
          toast({
            title: "✅ Facturas emitidas correctamente",
            description: `${successCount} factura${successCount !== 1 ? "s" : ""} emitida${
              successCount !== 1 ? "s" : ""
            } y enviada${successCount !== 1 ? "s" : ""} a VeriFactu`,
          })
        } else if (successCount > 0) {
          toast({
            title: "⚠️ Emisión parcialmente exitosa",
            description: `${successCount} facturas procesadas correctamente, ${errorCount} con errores. Las facturas con error se mantienen en borrador.`,
            variant: "destructive",
          })
        } else {
          toast({
            title: "❌ Error en todas las facturas",
            description: `No se pudo procesar ninguna factura. Todas se mantienen en borrador.`,
            variant: "destructive",
          })
        }

        // ✅ ESPERAR UN POCO MÁS PARA QUE EL USUARIO VEA EL RESULTADO FINAL
        await new Promise((resolve) => setTimeout(resolve, 2000))
      } else {
        // ✅ OTROS CAMBIOS DE ESTADO (SIN CAMBIAR NÚMERO)
        const updateData: any = { status: newStatus }
        if (isDraftToIssued) {
          updateData.validated_at = new Date().toISOString()
        }

        const { error } = await supabase.from("invoices").update(updateData).in("id", invoiceIds)

        if (error) {
          throw new Error(`Error al actualizar las facturas: ${error.message}`)
        }

        toast({
          title: "Estados actualizados",
          description: `${invoices.length} factura${invoices.length !== 1 ? "s" : ""} actualizada${
            invoices.length !== 1 ? "s" : ""
          } a ${getStatusConfig(newStatus).label}`,
        })
      }

      // ✅ CALLBACK SEGURO
      if (onStatusChanged && typeof onStatusChanged === "function") {
        try {
          onStatusChanged()
        } catch (callbackError) {
          console.error("Error en callback onStatusChanged:", callbackError)
        }
      }
    } catch (error) {
      console.error("❌ Error al actualizar estados:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron actualizar los estados",
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
      resetAllStates()
    }
  }

  // ✅ RESTO DE FUNCIONES AUXILIARES (mantener las existentes)
  const getDraftCount = (): number => {
    if (!Array.isArray(applicableInvoices)) return 0
    return applicableInvoices.filter((inv) => inv && inv.status === "draft").length
  }

  const getDraftInvoices = (): InvoiceStatusInfo[] => {
    if (!Array.isArray(applicableInvoices)) return []
    return applicableInvoices.filter((inv) => inv && inv.status === "draft")
  }

  const resetAllStates = () => {
    setSelectedNewStatus(null)
    setApplicableInvoices([])
    setNonApplicableInvoices([])
    setShowConfirmDialog(false)
    setShowEmissionDialog(false) // ✅ Cerrar el modal aquí
    setIsUpdating(false)
    setProcessingProgress({ current: 0, total: 0, currentInvoice: "", successCount: 0, errorCount: 0 })
  }

  const handleCancelDialog = () => {
    if (isUpdating) return
    resetAllStates()
  }

  const handleEmissionDialogChange = (open: boolean) => {
    if (!open && !isUpdating) {
      setShowEmissionDialog(false)
      setTimeout(() => {
        if (!showConfirmDialog) {
          resetAllStates()
        }
      }, 100)
    }
  }

  const handleConfirmDialogChange = (open: boolean) => {
    if (!open && !isUpdating) {
      setShowConfirmDialog(false)
      setTimeout(() => {
        if (!showEmissionDialog) {
          resetAllStates()
        }
      }, 100)
    }
  }

  const checkInvoicesAndPrepareChange = async (newStatus: InvoiceStatus) => {
    if (!Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0 || isUpdating) return

    setDropdownOpen(false)

    try {
      const safeInvoicesInfo = Array.isArray(invoicesInfo) ? invoicesInfo : []
      const applicable = safeInvoicesInfo.filter(
        (invoice) => invoice && invoice.status && isValidStatusTransition(invoice.status, newStatus),
      )
      const nonApplicable = safeInvoicesInfo.filter(
        (invoice) => invoice && invoice.status && !isValidStatusTransition(invoice.status, newStatus),
      )

      setApplicableInvoices(applicable)
      setNonApplicableInvoices(nonApplicable)
      setSelectedNewStatus(newStatus)

      setTimeout(() => {
        if (
          newStatus === "issued" &&
          Array.isArray(applicable) &&
          applicable.some((inv) => inv && inv.status === "draft")
        ) {
          setShowEmissionDialog(true)
          return
        }

        if (nonApplicable.length === 0) {
          performBulkStatusChange(applicable, newStatus)
        } else if (applicable.length === 0) {
          toast({
            title: "Cambio no válido",
            description: `Ninguna de las facturas seleccionadas puede cambiar a ${getStatusConfig(newStatus).label}`,
            variant: "destructive",
          })
          resetAllStates()
        } else {
          setShowConfirmDialog(true)
        }
      }, 100)
    } catch (error) {
      console.error("Error al verificar facturas:", error)
      toast({
        title: "Error",
        description: "No se pudo verificar el estado de las facturas",
        variant: "destructive",
      })
      resetAllStates()
    }
  }

  const getStatusSummary = (): string => {
    if (!Array.isArray(invoicesInfo) || invoicesInfo.length === 0) return "Cargando..."

    const statusCounts = new Map<InvoiceStatus, number>()
    invoicesInfo.forEach((invoice) => {
      if (invoice && invoice.status) {
        const count = statusCounts.get(invoice.status) || 0
        statusCounts.set(invoice.status, count + 1)
      }
    })

    const summaryParts = Array.from(statusCounts.entries()).map(([status, count]) => {
      const config = getStatusConfig(status)
      return `${count} ${config.label.toLowerCase()}${count !== 1 ? "s" : ""}`
    })

    return summaryParts.join(", ")
  }

  const getSelectionRecommendation = (): string | null => {
    if (!Array.isArray(invoicesInfo) || invoicesInfo.length === 0) return null

    const uniqueStatuses = new Set(invoicesInfo.map((inv) => inv?.status).filter(Boolean))

    if (uniqueStatuses.size === 1) {
      const singleStatus = Array.from(uniqueStatuses)[0]
      const config = getStatusConfig(singleStatus)
      return `✅ Todas las facturas están en ${config.label.toLowerCase()}`
    }

    if (uniqueStatuses.has("draft") && uniqueStatuses.has("issued")) {
      return "💡 Recomendación: Selecciona solo borradores para emitir"
    }

    if (uniqueStatuses.has("issued") && !uniqueStatuses.has("draft")) {
      return "✅ Facturas emitidas: no hay más cambios de estado disponibles"
    }

    if (uniqueStatuses.has("draft") && !uniqueStatuses.has("issued")) {
      return "✅ Facturas en borrador: pueden emitirse (se asignarán números y enviarán a VeriFactu)"
    }

    return null
  }

  // ✅ VALIDACIONES DE SEGURIDAD
  if (!Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0) {
    return null
  }

  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Settings className="mr-2 h-4 w-4" />
        Cambiar Estado
      </Button>
    )
  }

  if (!Array.isArray(availableStatuses) || availableStatuses.length === 0) {
    const uniqueStatuses = new Set(invoicesInfo.map((inv) => inv?.status).filter(Boolean))
    const buttonText = uniqueStatuses.size > 1 ? "Estados incompatibles" : "Sin cambios disponibles"
    return (
      <Button variant="outline" size="sm" disabled title="Selecciona facturas con estados compatibles">
        <Settings className="mr-2 h-4 w-4" />
        {buttonText}
      </Button>
    )
  }

  return (
    <>
      {/* ✅ DROPDOWN Y DIÁLOGOS - MANTENER IGUAL */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled || isUpdating}>
            <Settings className="mr-2 h-4 w-4" />
            {isUpdating ? "Procesando..." : "Cambiar Estado"}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="px-2 py-1.5 text-sm font-medium text-gray-700 border-b">
            Cambiar estado de {selectedInvoiceIds.length} factura{selectedInvoiceIds.length !== 1 ? "s" : ""}
          </div>
          <div className="px-3 py-2 text-xs text-gray-600 bg-gray-50 border-b">Seleccionadas: {getStatusSummary()}</div>
          {(() => {
            const recommendation = getSelectionRecommendation()
            if (recommendation) {
              return (
                <div className="px-3 py-2 text-xs border-b bg-blue-50">
                  <div className="text-blue-700">{recommendation}</div>
                </div>
              )
            }
            return null
          })()}
          {availableStatuses.map((status) => {
            const statusCfg = getStatusConfig(status)
            const StatusIcon = statusCfg.icon
            return (
              <DropdownMenuItem
                key={status}
                onClick={() => checkInvoicesAndPrepareChange(status)}
                disabled={isUpdating}
                className="flex items-start gap-3 py-3 cursor-pointer"
              >
                <StatusIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{statusCfg.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5 leading-tight">
                    {status === "issued"
                      ? "Asignar números únicos, validar y enviar a VeriFactu"
                      : statusCfg.description}
                  </div>
                </div>
              </DropdownMenuItem>
            )
          })}
          <div className="px-3 py-2 text-xs text-blue-600 bg-blue-50 border-t">
            <div className="font-medium">💡 Consejo</div>
            <div className="text-blue-700 mt-0.5">
              {(() => {
                const uniqueStatuses = new Set(invoicesInfo.map((inv) => inv?.status).filter(Boolean))
                if (uniqueStatuses.size === 1) {
                  return "Todas las facturas tienen el mismo estado. Perfecta selección para cambios masivos."
                }
                if (uniqueStatuses.has("draft") && uniqueStatuses.has("issued")) {
                  return "Mezcla de borradores y emitidas. Considera seleccionar solo borradores para emitir."
                }
                return "Solo se muestran los cambios de estado válidos para todas las facturas seleccionadas."
              })()}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ✅ MODAL MÁS GRANDE Y SIMPLIFICADO */}
      <Dialog open={showEmissionDialog} onOpenChange={handleEmissionDialogChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              Emisión masiva de facturas
            </DialogTitle>
            <DialogDescription className="space-y-4 pt-2">
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-medium text-amber-800 mb-1">⚠️ Acción irreversible</div>
                    <div className="text-amber-700">Las facturas emitidas no podrán volver a estado borrador.</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="text-lg text-blue-800 font-semibold text-center">
                    📋 {getDraftCount()} factura{getDraftCount() !== 1 ? "s" : ""} lista
                    {getDraftCount() !== 1 ? "s" : ""} para emitir
                  </div>
                  <div className="text-sm text-blue-600 mt-2 text-center">
                    Se procesarán secuencialmente para garantizar la integridad
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-md">
                    <Check className="w-5 h-5 text-green-600" />
                    <span className="text-sm text-green-800">Asignación de números únicos</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-md">
                    <Shield className="w-5 h-5 text-blue-600" />
                    <span className="text-sm text-blue-800">Validación fiscal</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-md">
                    <Check className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm text-indigo-800">Envío a VeriFactu</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-md">
                    <Clock className="w-5 h-5 text-purple-600" />
                    <span className="text-sm text-purple-800">Registro de fecha/hora</span>
                  </div>
                </div>
              </div>

              {/* ✅ BARRA DE PROGRESO SIMPLIFICADA */}
              {isUpdating && processingProgress.total > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-800 mb-2">Procesando facturas</div>
                    <div className="text-lg text-blue-600 font-mono">
                      {processingProgress.current} de {processingProgress.total}
                    </div>
                  </div>

                  {/* Barra de progreso grande y visible */}
                  <div className="w-full bg-blue-100 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${
                          processingProgress.total > 0
                            ? (processingProgress.current / processingProgress.total) * 100
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  {/* Estado actual */}
                  {processingProgress.currentInvoice && (
                    <div className="text-center">
                      <div className="text-sm text-blue-700 bg-white rounded-lg px-4 py-3 border border-blue-200 font-medium">
                        {processingProgress.currentInvoice}
                      </div>
                    </div>
                  )}

                  {/* Porcentaje grande */}
                  <div className="text-center">
                    <div className="text-4xl font-bold text-blue-600">
                      {processingProgress.total > 0
                        ? Math.round((processingProgress.current / processingProgress.total) * 100)
                        : 0}
                      %
                    </div>
                    <div className="text-sm text-blue-500 mt-1">completado</div>
                  </div>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleCancelDialog} disabled={isUpdating}>
              {isUpdating ? "Procesando..." : "Cancelar"}
            </Button>
            <Button
              onClick={() => {
                // ✅ NO cerrar el modal aquí - mantenerlo abierto durante el proceso
                if (selectedNewStatus) {
                  performBulkStatusChange(applicableInvoices, selectedNewStatus)
                }
              }}
              disabled={isUpdating || !selectedNewStatus || getDraftCount() === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isUpdating ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Procesando {getDraftCount()} facturas...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Confirmar emisión masiva
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ DIÁLOGO DE CONFIRMACIÓN PARCIAL - MANTENER IGUAL */}
      <Dialog open={showConfirmDialog} onOpenChange={handleConfirmDialogChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Cambio de estado parcial
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <p>
                No todas las facturas seleccionadas pueden cambiar a{" "}
                <strong>{selectedNewStatus && getStatusConfig(selectedNewStatus).label}</strong>:
              </p>
              {Array.isArray(applicableInvoices) && applicableInvoices.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <div className="font-medium text-green-800 text-sm mb-2">
                    ✅ Se actualizarán ({applicableInvoices.length} facturas):
                  </div>
                  <div className="text-sm text-green-700">
                    {applicableInvoices.length} factura{applicableInvoices.length !== 1 ? "s" : ""} en estado{" "}
                    <span className="font-medium">{getStatusConfig(applicableInvoices[0]?.status || "").label}</span>
                  </div>
                </div>
              )}
              {Array.isArray(nonApplicableInvoices) && nonApplicableInvoices.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                  <div className="font-medium text-amber-800 text-sm mb-2">
                    ⚠️ No se pueden cambiar ({nonApplicableInvoices.length} facturas):
                  </div>
                  <div className="text-sm text-amber-700">
                    Facturas en estados incompatibles con el cambio solicitado
                  </div>
                </div>
              )}
              <p>
                ¿Deseas continuar y actualizar solo las {applicableInvoices.length} factura
                {applicableInvoices.length !== 1 ? "s" : ""} válida{applicableInvoices.length !== 1 ? "s" : ""}?
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleCancelDialog} disabled={isUpdating}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setShowConfirmDialog(false)
                if (selectedNewStatus) {
                  performBulkStatusChange(applicableInvoices, selectedNewStatus)
                }
              }}
              disabled={
                isUpdating ||
                !selectedNewStatus ||
                !Array.isArray(applicableInvoices) ||
                applicableInvoices.length === 0
              }
            >
              {isUpdating
                ? "Procesando..."
                : `Actualizar ${applicableInvoices.length} factura${applicableInvoices.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
