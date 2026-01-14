import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/sales.dto';
import { CreatePaymentDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('pos')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) { }

  // ✅ FIXED: Changed method name from createSaleWithPaymentType to createSale
  @Post('sales')
  createSale(@Body() createSaleDto: CreateSaleDto, @Request() req: any) {
    return this.salesService.createSale(createSaleDto, req.user.userId);
  }

  // ✅ NEW: Add payment endpoint
  @Post('payments')
  addPayment(@Body() createPaymentDto: CreatePaymentDto, @Request() req: any) {
    const { salesInvoiceId, amount, paymentMethod, notes } = createPaymentDto;
    return this.salesService.addPayment(salesInvoiceId, amount, paymentMethod, req.user.userId, notes);
  }

  // ✅ NEW: Deliver products endpoint
  @Post('sales/:id/deliver')
  deliverSale(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.salesService.deliverSale(id, req.user.userId);
  }

  // ✅ NEW: Get customer pending payments
  @Get('customers/:customerId/pending-payments')
  getCustomerPendingPayments(@Param('customerId', ParseIntPipe) customerId: number) {
    return this.salesService.getCustomerPendingPayments(customerId);
  }

  @Get('sales')
  findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('branchId') branchId?: string,
    @Query('customerId') customerId?: string,
    @Query('search') search?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('dateFilter') dateFilter?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.salesService.findAll({
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
      branchId: branchId ? parseInt(branchId) : undefined,
      customerId: customerId ? parseInt(customerId) : undefined,
      search,
      paymentMethod,
      dateFilter,
      startDate,
      endDate,
    });
  }

  @Get('sales/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findOne(id);
  }

  @Get('daily-summary')
  getDailySummary(
    @Query('branchId', ParseIntPipe) branchId: number,
    @Query('date') date?: string,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    return this.salesService.getDailySummary(branchId, targetDate);
  }
}
