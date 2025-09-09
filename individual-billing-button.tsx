"use client"

import { useState, useEffect } from "react"
import { FileText, Loader2, AlertTriangle, Clock, Download, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/lib/supabase/client"
import { useAuth } from "@/app/contexts/auth-context"
import { format } from "date-fns"
import type { AppointmentWithDetails } from "@/types/calendar"

interface IndividualBillingButtonProps {
  appointment: AppointmentWithDetails
  onBillingComplete?: () => void
}

type InvoiceStatus = "draft" | "issued" | "sent" | "paid"

interface ExistingInvoice {
  invoice_number: string | null
  created_at: string
  id: string
  status: InvoiceStatus
}

export function IndividualBillingButton({ appointment, onBillingComplete }: IndividualBillingButtonProps) {
  const { userProfile } = useAuth()
  const { toast } = useToast()
  const [generating, setGenerating] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [existingInvoice, setExistingInvoice] = useState<ExistingInvoice | null>(null)
  const [checkingInvoice, setCheckingInvoice] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isConfirmingIssue, setIsConfirmingIssue] = useState(false)

  // Estado del formulario
  const [formData, setFormData] = useState({
    issue_date: new Date().toISOString().split("T")[0],
    notes: "",
    payment_method: "tarjeta" as "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro",
    payment_method_other: "",
  })

  const hasService = appointment.service?.id && appointment.service?.price
  const serviceData = appointment.service

  // ✅ VALIDACIÓN MODIFICADA - SOLO NOMBRE (CON APELLIDOS) Y TAX_ID
  const validateClientData = () => {
    const client = appointment.client
    if (!client) {
      return { isValid: false, missingFields: ["Cliente completo"] }
    }

    const missingFields: string[] = []

    // Verificar nombre (debe tener al menos 2 palabras para incluir apellidos)
    if (!client.name?.trim()) {
      missingFields.push("Nombre")
    } else {
      const nameParts = client.name.trim().split(/\s+/)
      if (nameParts.length < 2) {
        missingFields.push("Apellidos (el nombre debe incluir nombre y apellidos)")
      }
    }

    // Verificar tax_id (CIF/NIF)
    if (!(client as any).tax_id?.trim()) {
      missingFields.push("CIF/NIF")
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
    }
  }

  const clientValidation = validateClientData()

  // ✅ CREAR BORRADOR DE FACTURA
  const createDraftInvoice = async () => {
    if (!userProfile?.organization_id) {
      return
    }

    setGenerating(true)
    try {
      // Obtener datos de la organización
      const { data: orgData, error: orgError } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", userProfile.organization_id)
        .single()

      if (orgError || !orgData) {
        throw new Error("No se pudieron obtener los datos de la organización")
      }

      // Usar precio del servicio
      const servicePrice = serviceData!.price
      const invoiceLines = [
        {
          id: crypto.randomUUID(),
          description: `${serviceData!.name} - ${appointment.professional?.name || "Sin profesional"} (${appointment.start_time}-${appointment.end_time})`,
          quantity: 1,
          unit_price: servicePrice,
          discount_percentage: 0,
          vat_rate: serviceData!.vat_rate ?? 0,
          irpf_rate: serviceData!.irpf_rate ?? 0,
          retention_rate: serviceData!.retention_rate ?? 0,
          line_amount: servicePrice,
          professional_id: null,
        },
      ]

      // Calcular totales
      const subtotalAmount = invoiceLines.reduce((sum, line) => {
        return sum + line.quantity * line.unit_price
      }, 0)

      const totalDiscountAmount = invoiceLines.reduce((sum, line) => {
        const lineSubtotal = line.quantity * line.unit_price
        const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
        return sum + lineDiscount
      }, 0)

      const baseAmount = subtotalAmount - totalDiscountAmount

      const vatAmount = invoiceLines.reduce((sum, line) => {
        const lineSubtotal = line.quantity * line.unit_price
        const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
        const lineBase = lineSubtotal - lineDiscount
        const lineVat = (lineBase * (line.vat_rate ?? 0)) / 100
        return sum + lineVat
      }, 0)

      const irpfAmount = invoiceLines.reduce((sum, line) => {
        const lineSubtotal = line.quantity * line.unit_price
        const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
        const lineBase = lineSubtotal - lineDiscount
        const lineIrpf = (lineBase * (line.irpf_rate ?? 0)) / 100
        return sum + lineIrpf
      }, 0)

      const retentionAmount = invoiceLines.reduce((sum, line) => {
        const lineSubtotal = line.quantity * line.unit_price
        const lineDiscount = (lineSubtotal * line.discount_percentage) / 100
        const lineBase = lineSubtotal - lineDiscount
        const lineRetention = (lineBase * (line.retention_rate ?? 0)) / 100
        return sum + lineRetention
      }, 0)

      const totalAmount = baseAmount + vatAmount - irpfAmount - retentionAmount

      // Preparar datos de la factura
      const client = appointment.client!
      const clientInfoText = `Cliente: ${client.name}, CIF/NIF: ${(client as any).tax_id}`
      const additionalNotes = `Factura generada para cita del ${format(new Date(appointment.date), "dd/MM/yyyy")} - ${appointment.start_time}
Servicio: ${serviceData!.name} - ${servicePrice}€`

      const fullNotes =
        clientInfoText + "\n\n" + additionalNotes + (formData.notes ? `\n\nNotas adicionales: ${formData.notes}` : "")

      // ✅ CREAR FACTURA EN ESTADO BORRADOR (SIN NÚMERO)
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          organization_id: userProfile.organization_id,
          invoice_number: null, // ✅ Sin número en borrador
          client_id: appointment.client_id,
          appointment_id: appointment.id,
          issue_date: formData.issue_date,
          invoice_type: "normal",
          status: "draft", // ✅ Estado borrador
          base_amount: baseAmount,
          vat_amount: vatAmount,
          irpf_amount: irpfAmount,
          retention_amount: retentionAmount,
          total_amount: totalAmount,
          discount_amount: totalDiscountAmount,
          notes: fullNotes,
          payment_method: formData.payment_method,
          payment_method_other: formData.payment_method === "otro" ? formData.payment_method_other : null,
          created_by: userProfile.id,
        })
        .select()
        .single()

      if (invoiceError) throw invoiceError

      // Actualización optimista inmediata
      setExistingInvoice({
        invoice_number: null, // Sin número en borrador
        created_at: invoiceData.created_at,
        id: invoiceData.id,
        status: "draft",
      })

      // Crear líneas de factura
      const invoiceLines_db = invoiceLines.map((line) => ({
        invoice_id: invoiceData.id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_percentage: line.discount_percentage,
        vat_rate: line.vat_rate,
        irpf_rate: line.irpf_rate,
        retention_rate: line.retention_rate,
        line_amount: line.line_amount,
        professional_id: line.professional_id ? Number.parseInt(line.professional_id) : null,
      }))

      const { error: linesError } = await supabase.from("invoice_lines").insert(invoiceLines_db)

      if (linesError) {
        console.error("Error saving invoice lines:", linesError)
      }

      toast({
        title: "✅ Borrador creado",
        description: `Borrador de factura creado correctamente (${servicePrice}€)`,
      })

      // Cerrar modal
      setIsModalOpen(false)
      if (onBillingComplete) {
        onBillingComplete()
      }
    } catch (error) {
      console.error("Error creating draft invoice:", error)
      // Revertir actualización optimista en caso de error
      setExistingInvoice(null)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear el borrador",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  // ✅ EMITIR FACTURA (ASIGNAR NÚMERO Y ENVIAR A VERIFACTU)
  const issueInvoice = async () => {
    console.log("🔥 issueInvoice iniciada", { existingInvoice, userProfile })
    if (!existingInvoice || !userProfile?.organization_id) {
      console.log("🔥 issueInvoice cancelada - falta existingInvoice o userProfile")
      return
    }

    setIssuing(true)
    setIsConfirmingIssue(false) // Mantener el estado de confirmación para mostrar el progreso

    try {
      const { generateUniqueInvoiceNumber } = await import("@/lib/invoice-utils")

      // Generar número de factura único
      const { invoiceNumberFormatted, newInvoiceNumber } = await generateUniqueInvoiceNumber(
        userProfile.organization_id,
        "normal",
      )

      // Actualizar contador en organización
      const { error: updateOrgError } = await supabase
        .from("organizations")
        .update({ last_invoice_number: newInvoiceNumber })
        .eq("id", userProfile.organization_id)

      if (updateOrgError) {
        throw new Error("Error al reservar el número de factura")
      }

      // Actualizar factura con número y estado
      const { error: updateInvoiceError } = await supabase
        .from("invoices")
        .update({
          status: "issued",
          invoice_number: invoiceNumberFormatted,
          validated_at: new Date().toISOString(),
        })
        .eq("id", existingInvoice.id)

      if (updateInvoiceError) {
        throw new Error("Error al actualizar la factura")
      }

      // Verificar que el número esté asignado
      const { data: verifyInvoice, error: verifyError } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("id", existingInvoice.id)
        .single()

      if (verifyError || !verifyInvoice?.invoice_number) {
        throw new Error("La factura no tiene número asignado después de la actualización")
      }

      // Enviar a VeriFactu
      /*
      try {
        const res = await fetch(`/api/verifactu/send-invoice?invoice_id=${existingInvoice.id}`)
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error || `Error ${res.status}: ${res.statusText}`)
        }

        // Actualizar estado local
        setExistingInvoice((prev) =>
          prev
            ? {
                ...prev,
                invoice_number: invoiceNumberFormatted,
                status: "issued",
              }
            : null,
        )

        toast({
          title: "✅ Factura emitida",
          description: `Factura ${invoiceNumberFormatted} emitida y enviada a VeriFactu correctamente`,
        })

        if (onBillingComplete) {
          onBillingComplete()
        }
      } catch (verifactuError) {
        console.error("Error en VeriFactu, haciendo rollback...")

        // Rollback completo
        await supabase
          .from("invoices")
          .update({
            status: "draft",
            invoice_number: null,
            validated_at: null,
          })
          .eq("id", existingInvoice.id)

        await supabase
          .from("organizations")
          .update({ last_invoice_number: newInvoiceNumber - 1 })
          .eq("id", userProfile.organization_id)

        throw new Error("Error al enviar a VeriFactu. Se ha revertido la emisión.")
      }
      */

      // Actualizar estado local
      setExistingInvoice((prev) =>
        prev
          ? {
              ...prev,
              invoice_number: invoiceNumberFormatted,
              status: "issued",
            }
          : null,
      )

      toast({
        title: "✅ Factura emitida",
        description: `Factura ${invoiceNumberFormatted} emitida correctamente (VeriFactu desactivado temporalmente)`,
      })

      if (onBillingComplete) {
        onBillingComplete()
      }
    } catch (error) {
      console.error("Error issuing invoice:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo emitir la factura",
        variant: "destructive",
      })
    } finally {
      setIssuing(false)
    }
  }

  const checkExistingInvoice = async () => {
    if (!userProfile?.organization_id || !appointment.id) {
      setCheckingInvoice(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, created_at, status")
        .eq("organization_id", userProfile.organization_id)
        .eq("appointment_id", appointment.id)
        .order("created_at", { ascending: false })
        .limit(1)

      if (error) throw error

      if (data && data.length > 0) {
        setExistingInvoice(data[0] as ExistingInvoice)
      }
    } catch (error) {
      console.error("Error checking existing invoice:", error)
    } finally {
      setCheckingInvoice(false)
    }
  }

  useEffect(() => {
    checkExistingInvoice()
  }, [appointment.id, appointment.client_id, appointment.date, userProfile])

  useEffect(() => {
    if (!issuing) {
      setIsConfirmingIssue(false)
    }
  }, [issuing])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(amount)
  }

  // Si no hay servicio, mostrar mensaje de error
  if (!hasService) {
    return (
      <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span>Sin servicio asociado</span>
        </div>
      </div>
    )
  }

  // Si faltan datos del cliente, mostrar mensaje
  if (!clientValidation.isValid) {
    return (
      <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200">
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          <span>Faltan datos: {clientValidation.missingFields.join(", ")}</span>
        </div>
      </div>
    )
  }

  // Si está verificando factura existente
  if (checkingInvoice) {
    return (
      <div className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-200">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 animate-spin" />
          <span>Verificando...</span>
        </div>
      </div>
    )
  }

  // ✅ SI EXISTE FACTURA - MOSTRAR SEGÚN ESTADO
  if (existingInvoice) {
    const getStatusConfig = (status: InvoiceStatus) => {
      switch (status) {
        case "draft":
          return {
            label: "Borrador creado",
            color: "text-amber-700 bg-amber-50 border-amber-200",
            icon: FileText,
          }
        case "issued":
          return {
            label: "Facturada",
            color: "text-green-700 bg-green-50 border-green-200",
            icon: null, // Sin icono
          }
        case "sent":
          return {
            label: "Enviada",
            color: "text-blue-700 bg-blue-50 border-blue-200",
            icon: null, // Sin icono
          }
        case "paid":
          return {
            label: "Pagada",
            color: "text-green-700 bg-green-50 border-green-200",
            icon: null, // Sin icono
          }
        default:
          return {
            label: "Desconocido",
            color: "text-gray-600 bg-gray-50 border-gray-200",
            icon: AlertTriangle,
          }
      }
    }

    const statusConfig = getStatusConfig(existingInvoice.status)
    const StatusIcon = statusConfig.icon

    return (
      <div className="flex items-center gap-2">
        <button
          className={`text-xs px-3 py-2 rounded-lg border ${statusConfig.color} hover:opacity-80 transition-opacity cursor-pointer`}
          onClick={async () => {
            if (existingInvoice.status === "draft" && existingInvoice?.id) {
              try {
                const { generatePdf } = await import("@/lib/pdf-generator")

                // Obtener datos completos de la factura
                const { data: fullInvoiceData, error: invoiceError } = await supabase
                  .from("invoices")
                  .select(`
                    *,
                    organization:organizations(*),
                    client:clients(*),
                    invoice_lines(*)
                  `)
                  .eq("id", existingInvoice.id)
                  .single()

                if (invoiceError || !fullInvoiceData) {
                  throw new Error("No se pudieron obtener los datos de la factura")
                }

                // Preparar datos para el PDF
                const invoiceForPdf = {
                  ...fullInvoiceData,
                  client_data: {
                    name: fullInvoiceData.client.name,
                    tax_id: fullInvoiceData.client.tax_id || "",
                    address: fullInvoiceData.client.address || "",
                    postal_code: fullInvoiceData.client.postal_code || "",
                    city: fullInvoiceData.client.city || "",
                    province: fullInvoiceData.client.province || "",
                    country: "España",
                    email: fullInvoiceData.client.email || "",
                    phone: fullInvoiceData.client.phone || "",
                    client_type: "private",
                  },
                }

                const filename = `borrador-${existingInvoice.id}.pdf`
                const pdfBlob = await generatePdf(invoiceForPdf, fullInvoiceData.invoice_lines, filename, true)

                if (pdfBlob && pdfBlob instanceof Blob) {
                  const url = window.URL.createObjectURL(pdfBlob)
                  const link = document.createElement("a")
                  link.href = url
                  link.download = filename
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  window.URL.revokeObjectURL(url)
                }
              } catch (error) {
                console.error("Error downloading draft:", error)
                toast({
                  title: "Error",
                  description: "No se pudo descargar el borrador",
                  variant: "destructive",
                })
              }
            }
          }}
          title={existingInvoice.status === "draft" ? "Descargar borrador" : undefined}
        >
          <div className="flex items-center gap-2">
            {StatusIcon && <StatusIcon className="h-4 w-4" />}
            <div className="font-medium">{existingInvoice.status === "draft" ? "Borrador" : statusConfig.label}</div>
          </div>
        </button>

        {existingInvoice.status === "draft" && (
          <div className="flex items-center gap-1">
            {!isConfirmingIssue ? (
              <Button
                variant="default"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsConfirmingIssue(true)
                }}
                disabled={issuing}
                className="h-7 px-3 bg-green-600 hover:bg-green-700"
              >
                Emitir
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfirmingIssue(false)}
                  disabled={issuing}
                  className="h-7 px-2 text-xs border-gray-300 hover:bg-gray-50"
                >
                  Cancelar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    issueInvoice()
                  }}
                  disabled={issuing}
                  className="h-7 px-2 bg-red-600 hover:bg-red-700 text-xs font-medium"
                >
                  {issuing ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      Emitiendo...
                    </>
                  ) : (
                    "Confirmar envío"
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {existingInvoice.status !== "draft" && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const { data: fullInvoiceData, error: invoiceError } = await supabase
                  .from("invoices")
                  .select(`
                    *,
                    organization:organizations(*),
                    client:clients(*),
                    invoice_lines(*)
                  `)
                  .eq("id", existingInvoice.id)
                  .single()

                if (invoiceError || !fullInvoiceData) {
                  throw new Error("No se pudieron obtener los datos de la factura")
                }

                const invoiceForPdf = {
                  ...fullInvoiceData,
                  client_data: {
                    name: fullInvoiceData.client.name,
                    tax_id: fullInvoiceData.client.tax_id || "",
                    address: fullInvoiceData.client.address || "",
                    postal_code: fullInvoiceData.client.postal_code || "",
                    city: fullInvoiceData.client.city || "",
                    province: fullInvoiceData.client.province || "",
                    country: "España",
                    email: fullInvoiceData.client.email || "",
                    phone: fullInvoiceData.client.phone || "",
                    client_type: "private",
                  },
                }

                const filename = `factura-${existingInvoice.invoice_number}.pdf`
                const { generatePdf } = await import("@/lib/pdf-generator")

                // ✅ Para facturas emitidas, incluir datos de VeriFactu
                const pdfBlob = await generatePdf(invoiceForPdf, fullInvoiceData.invoice_lines, filename, false)

                if (pdfBlob && pdfBlob instanceof Blob) {
                  const url = window.URL.createObjectURL(pdfBlob)
                  const link = document.createElement("a")
                  link.href = url
                  link.download = filename
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  window.URL.revokeObjectURL(url)
                }
              } catch (error) {
                console.error("Error downloading invoice:", error)
                toast({
                  title: "Error",
                  description: "No se pudo descargar la factura",
                  variant: "destructive",
                })
              }
            }}
            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200"
          >
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

  // ✅ SI NO HAY FACTURA - MOSTRAR BOTÓN CREAR BORRADOR
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsModalOpen(true)}
        disabled={generating}
        className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50 bg-transparent"
      >
        <FileText className="h-4 w-4" />
        Crear Borrador
      </Button>

      {/* ✅ MODAL PARA CREAR BORRADOR */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          // Solo permitir cerrar si no está generando ni emitiendo
          if (!generating && !issuing) {
            setIsModalOpen(open)
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Crear Borrador de Factura
            </DialogTitle>
            <DialogDescription>
              Crear borrador para la cita de {appointment.client.name} del{" "}
              {format(new Date(appointment.date), "dd/MM/yyyy")} a las {appointment.start_time}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Información de la cita */}
            <Card>
              <CardHeader>
                <CardTitle>Información de la Cita</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Cliente:</span> {appointment.client.name}
                  </div>
                  <div>
                    <span className="font-medium">Fecha:</span> {format(new Date(appointment.date), "dd/MM/yyyy")}
                  </div>
                  <div>
                    <span className="font-medium">Hora:</span> {appointment.start_time} - {appointment.end_time}
                  </div>
                  <div>
                    <span className="font-medium">Profesional:</span> {appointment.professional?.name}
                  </div>
                  {appointment.service && (
                    <>
                      <div>
                        <span className="font-medium">Servicio:</span> {appointment.service.name}
                      </div>
                      <div>
                        <span className="font-medium">Precio:</span> {formatCurrency(appointment.service.price)}
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Datos de la factura */}
            <Card>
              <CardHeader>
                <CardTitle>Datos de la Factura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="issue_date">Fecha de Emisión</Label>
                  <Input
                    id="issue_date"
                    type="date"
                    value={formData.issue_date}
                    onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas Adicionales</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Notas adicionales para la factura..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Método de Pago */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Método de Pago
                </CardTitle>
                <CardDescription>Selecciona el método de pago utilizado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payment_method">Método de Pago</Label>
                  <Select
                    value={formData.payment_method}
                    onValueChange={(value: "tarjeta" | "efectivo" | "transferencia" | "paypal" | "bizum" | "otro") =>
                      setFormData((prev) => ({
                        ...prev,
                        payment_method: value,
                        payment_method_other: value !== "otro" ? "" : prev.payment_method_other,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona método de pago" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="bizum">Bizum</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.payment_method === "otro" && (
                  <div className="space-y-2">
                    <Label htmlFor="payment_method_other">Especificar método de pago</Label>
                    <Input
                      id="payment_method_other"
                      value={formData.payment_method_other}
                      onChange={(e) => setFormData((prev) => ({ ...prev, payment_method_other: e.target.value }))}
                      placeholder="Especifica el método de pago..."
                      required
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={generating || issuing}
            >
              Cancelar
            </Button>
            <Button onClick={createDraftInvoice} disabled={generating || issuing}>
              {generating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando borrador...
                </>
              ) : issuing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Emitiendo...
                </>
              ) : (
                "Crear Borrador"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
